// ═══════════════════════════════════════════════════════════════════════════
// Z-API Webhook handler
//
// Z-API manda payloads diferentes para cada tipo de evento, identificados
// pelo campo "type":
//   - ReceivedCallback       → mensagem recebida (inbound)
//   - MessageStatusCallback  → status (SENT/DELIVERED/READ)
//   - DisconnectedCallback   → WhatsApp Web desconectou
//   - ConnectedCallback      → WhatsApp Web (re)conectou
//   - SendStatusCallback     → confirmação de envio (ignorado, já tracking)
//
// Auth: se ZAPI_CLIENT_TOKEN estiver setada, validamos via header "Client-Token".
// Se não, aceitamos mas logamos warning.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ChatStatus, MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast, broadcastSystemEvent } from "@/lib/sse-emitter"
import { saveMediaBuffer } from "@/lib/mediaStorage"
import { enqueueInbound } from "@/lib/reliability/queue"
import { applyRating, parseRating } from "@/lib/serviceTracking"
import { sendTextOk } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── Payload types ───────────────────────────────────────────────────────────

interface ZapiTextPayload {
  type: "ReceivedCallback"
  instanceId?: string
  messageId: string
  phone: string                 // sender's phone
  fromMe?: boolean
  momment?: number
  senderName?: string
  chatName?: string
  senderPhoto?: string | null
  isGroup?: boolean
  participantPhone?: string
  text?: { message: string }
  image?: { imageUrl?: string; mimeType?: string; caption?: string; thumbnailUrl?: string }
  video?: { videoUrl?: string; mimeType?: string; caption?: string }
  audio?: { audioUrl?: string; mimeType?: string }
  document?: { documentUrl?: string; mimeType?: string; fileName?: string; caption?: string }
}

interface ZapiStatusPayload {
  type: "MessageStatusCallback"
  messageId: string
  phone: string
  status: "SENT" | "RECEIVED" | "DELIVERED" | "READ" | "VIEWED" | "PLAYED"
}

interface ZapiConnectionPayload {
  type: "DisconnectedCallback" | "ConnectedCallback"
  phone?: string
  connected?: boolean
}

type ZapiPayload = ZapiTextPayload | ZapiStatusPayload | ZapiConnectionPayload

// ─── Auth ────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.ZAPI_CLIENT_TOKEN
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[CRITICAL] ZAPI_CLIENT_TOKEN ausente — webhook Z-API sem validação. Configure no painel Z-API e no .env.")
    }
    return true
  }
  const received = request.headers.get("client-token") ?? ""
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Normaliza phone do Z-API ("5511999999999") pro nosso formato interno
// que usa "5511999999999@s.whatsapp.net" pra individuais e "@g.us" pra grupos.
function toWhatsappId(phone: string, isGroup: boolean): string {
  if (isGroup) return phone.endsWith("@g.us") ? phone : `${phone}@g.us`
  if (phone.includes("@")) return phone
  return `${phone}@s.whatsapp.net`
}

function extractMediaUrl(p: ZapiTextPayload): { url: string; mimetype: string; fileName?: string; caption?: string } | null {
  if (p.image?.imageUrl) return { url: p.image.imageUrl, mimetype: p.image.mimeType ?? "image/jpeg", caption: p.image.caption }
  if (p.video?.videoUrl) return { url: p.video.videoUrl, mimetype: p.video.mimeType ?? "video/mp4", caption: p.video.caption }
  if (p.audio?.audioUrl) return { url: p.audio.audioUrl, mimetype: p.audio.mimeType ?? "audio/ogg" }
  if (p.document?.documentUrl) return { url: p.document.documentUrl, mimetype: p.document.mimeType ?? "application/octet-stream", fileName: p.document.fileName, caption: p.document.caption }
  return null
}

function extractText(p: ZapiTextPayload): string {
  return p.text?.message
    ?? p.image?.caption
    ?? p.video?.caption
    ?? p.document?.caption
    ?? ""
}

async function downloadMediaToBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  } catch (err) {
    console.error("[zapi-webhook] download mídia falhou:", err)
    return null
  }
}

// ─── Tipo: mensagem recebida ─────────────────────────────────────────────────

async function handleReceived(p: ZapiTextPayload): Promise<void> {
  // Ignora outbound nosso voltando em loop. Mesmo com dedupe, evita trabalho.
  if (p.fromMe === true) return

  const whatsappId = toWhatsappId(p.phone, !!p.isGroup)
  const messageText = extractText(p)
  const pushName = p.senderName ?? p.chatName ?? whatsappId

  // 1 — Upsert contato
  const contact = await prisma.contact.upsert({
    where: { whatsappId },
    create: {
      whatsappId,
      name: pushName,
      profilePhotoUrl: p.senderPhoto ?? null,
    },
    update: {
      ...(p.senderName ? { name: p.senderName } : {}),
      ...(p.senderPhoto ? { profilePhotoUrl: p.senderPhoto } : {}),
    },
  })

  // 2 — Baixa mídia se houver, salva privado, gera mediaUrl interno
  let media: { mediaUrl: string; mediaType: string } | null = null
  const rawMedia = extractMediaUrl(p)
  if (rawMedia) {
    const buf = await downloadMediaToBuffer(rawMedia.url)
    if (buf) {
      const saved = await saveMediaBuffer(buf, rawMedia.mimetype, rawMedia.fileName)
      media = { mediaUrl: saved.mediaUrl, mediaType: saved.mediaType }
    }
  }

  // 3 — Cria Message com dedupe por messageId (whatsappKeyId)
  let saved
  try {
    saved = await prisma.message.create({
      data: {
        body: messageText,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.DELIVERED,
        contactId: contact.id,
        whatsappKeyId: p.messageId,
        ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
      },
    })
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      console.log(`[zapi-webhook] duplicata ignorada messageId=${p.messageId}`)
      return
    }
    throw err
  }

  // 4 — SSE broadcast pra UI
  broadcast({
    type: "new_message",
    data: {
      id: saved.id, body: saved.body, direction: saved.direction,
      status: saved.status, createdAt: saved.createdAt.toISOString(),
      agentId: saved.agentId, contactId: contact.id,
      mediaUrl: saved.mediaUrl, mediaType: saved.mediaType,
      contact: {
        id: contact.id, whatsappId: contact.whatsappId,
        name: contact.name, profilePhotoUrl: contact.profilePhotoUrl,
        chatStatus: contact.chatStatus,
        assignedUserId: contact.assignedUserId,
      },
    },
  })

  // 5a — Captura nota se contato está aguardando avaliação
  if (contact.chatStatus === ChatStatus.AWAITING_RATING) {
    const parsed = parseRating(messageText)
    if (parsed) {
      const { sessionId } = await applyRating(contact.id, parsed.rating, parsed.comment)
      if (sessionId) {
        const thanks = parsed.rating >= 4
          ? "🙏 Obrigado pela avaliação! Ficamos felizes em ajudar."
          : "🙏 Obrigado pela avaliação. Vamos trabalhar para melhorar."
        const ok = await sendTextOk(contact.whatsappId, thanks)
        await prisma.message.create({
          data: {
            body: thanks,
            direction: MessageDirection.OUTBOUND,
            status: ok ? MessageStatus.SENT : MessageStatus.FAILED,
            contactId: contact.id,
          },
        })
      }
    }
    return
  }

  // 5b — Contato com agente atribuído: marca IN_SERVICE
  if (contact.assignedUserId !== null) {
    if (contact.chatStatus !== ChatStatus.IN_SERVICE) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { chatStatus: ChatStatus.IN_SERVICE },
      })
    }
    return
  }

  // 5c — Sem agente: enfileira URA na fila durável
  await enqueueInbound({
    whatsappKeyId: p.messageId,
    whatsappId: contact.whatsappId,
    messageText,
    contactName: contact.name,
  })
}

// ─── Tipo: status (entregue/lido) ────────────────────────────────────────────

async function handleMessageStatus(p: ZapiStatusPayload): Promise<void> {
  const isRead = p.status === "READ" || p.status === "VIEWED" || p.status === "PLAYED"
  const isDelivered = p.status === "DELIVERED" || p.status === "RECEIVED"
  if (!isRead && !isDelivered) return

  const message = await prisma.message.findFirst({
    where: { whatsappKeyId: p.messageId },
    select: { id: true, contactId: true, status: true },
  })
  if (!message) return

  // Não regride status (READ > DELIVERED > SENT)
  const ranks: Record<string, number> = { PENDING: 0, SENT: 1, FAILED: 1, DELIVERED: 2, READ: 3 }
  const newStatus = isRead ? MessageStatus.READ : MessageStatus.DELIVERED
  if ((ranks[newStatus] ?? 0) <= (ranks[message.status] ?? 0)) return

  await prisma.message.update({
    where: { id: message.id },
    data: { status: newStatus },
  })

  broadcast({
    type: "message_update",
    data: { id: message.id, status: newStatus, contactId: message.contactId },
  })

  // CampaignLog (mesmo schema do Evolution path)
  await prisma.campaignLog.updateMany({
    where: { messageKeyId: p.messageId },
    data: isRead
      ? { status: "READ", readAt: new Date(), deliveredAt: new Date() }
      : { status: "DELIVERED", deliveredAt: new Date() },
  })
}

// ─── Tipo: conexão (banner vermelho ↔ verde) ─────────────────────────────────

function handleConnection(p: ZapiConnectionPayload): void {
  const isConnected = p.type === "ConnectedCallback" || p.connected === true
  const state = isConnected ? "open" : "close"
  console.warn(`[zapi-webhook] Z-API reportou estado: ${state}`)
  broadcastSystemEvent({ type: "evolution_state", state })
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    console.error("[CRITICAL] z-api webhook 403 — Client-Token mismatch", {
      ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      receivedKeyLength: (request.headers.get("client-token") ?? "").length,
      hasExpected: !!process.env.ZAPI_CLIENT_TOKEN,
      at: new Date().toISOString(),
    })
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let payload: ZapiPayload
  try {
    payload = (await request.json()) as ZapiPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    switch (payload.type) {
      case "ReceivedCallback":
        await handleReceived(payload)
        return NextResponse.json({ received: true, processed: true, event: payload.type })

      case "MessageStatusCallback":
        await handleMessageStatus(payload)
        return NextResponse.json({ received: true, processed: true, event: payload.type })

      case "ConnectedCallback":
      case "DisconnectedCallback":
        handleConnection(payload)
        return NextResponse.json({ received: true, processed: true, event: payload.type })

      default:
        return NextResponse.json({ received: true, processed: false, event: (payload as { type?: string }).type })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown"
    console.error("[zapi-webhook] erro:", msg)
    // Retorna 200 mesmo com erro pra Z-API não reenviar em loop (já temos dedupe)
    return NextResponse.json({ received: true, error: msg }, { status: 200 })
  }
}

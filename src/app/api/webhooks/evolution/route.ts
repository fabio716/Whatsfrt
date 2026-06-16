import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { ChatStatus, MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { fetchMediaBase64 } from "@/lib/evolution"
import { saveMediaBuffer } from "@/lib/mediaStorage"
import { enqueueInbound } from "@/lib/reliability/queue"

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// ─── Evolution API Payload Types ─────────────────────────────────────────────

interface EvolutionMessageKey {
  remoteJid: string
  fromMe: boolean
  id: string
  participant?: string
}

interface MediaMessageBase {
  caption?: string
  url?: string
  mimetype?: string
  base64?: string
  fileName?: string
}

interface EvolutionMessageContent {
  conversation?: string
  extendedTextMessage?: { text?: string }
  imageMessage?:    MediaMessageBase
  videoMessage?:    MediaMessageBase
  documentMessage?: MediaMessageBase
  audioMessage?:    MediaMessageBase
  stickerMessage?:  MediaMessageBase
  reactionMessage?:  { text?: string }
  locationMessage?: { degreesLatitude?: number; degreesLongitude?: number }
}

interface EvolutionMessageData {
  key: EvolutionMessageKey
  pushName?: string
  message?: EvolutionMessageContent
  messageType?: string
  messageTimestamp?: number
  profilePicUrl?: string
  instanceId?: string
  source?: string
}

interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: EvolutionMessageData | EvolutionMessageData[]
  destination?: string
  date_time?: string
  sender?: string
  server_url?: string
  apikey?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractMessageText(message?: EvolutionMessageContent): string {
  if (!message) return ""

  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    message.reactionMessage?.text ??
    ""
  )
}

function normalizeRemoteJid(remoteJid: string): string {
  if (remoteJid.endsWith("@g.us")) return remoteJid
  // Remove qualquer sufixo e normaliza para @s.whatsapp.net
  return remoteJid.replace(/@.*$/, "") + "@s.whatsapp.net"
}

// ─── Media helper ────────────────────────────────────────────────────────────

async function saveMediaFromBase64(
  base64: string,
  mimetype: string,
  fileName?: string
): Promise<{ mediaUrl: string; mediaType: string } | null> {
  try {
    const saved = await saveMediaBuffer(Buffer.from(base64, "base64"), mimetype, fileName)
    return { mediaUrl: saved.mediaUrl, mediaType: saved.mediaType }
  } catch (err) {
    console.error("[webhook] saveMediaFromBase64 error:", err)
    return null
  }
}

function extractMedia(
  message?: EvolutionMessageContent
): { base64?: string; mimetype: string; fileName?: string } | null {
  if (!message) return null
  const candidates = [
    message.imageMessage,
    message.videoMessage,
    message.documentMessage,
    message.audioMessage,
    message.stickerMessage,
  ]
  for (const m of candidates) {
    if (m?.mimetype) {
      return { base64: m.base64, mimetype: m.mimetype, fileName: m.fileName }
    }
  }
  return null
}


// Lógica de URA agora vive em @/lib/ura/inbound e é executada por worker.

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handleMessagesUpsert(messageData: EvolutionMessageData): Promise<void> {
  const { key, pushName, message, profilePicUrl } = messageData

  // Outbound messages from Evolution API (fromMe) are handled by /api/messages/send
  // or by sendUraMessage — skip to avoid duplicates.
  if (key.fromMe) return

  const remoteJid = normalizeRemoteJid(key.remoteJid)
  const messageText = extractMessageText(message)

  // ── 1. Upsert contact — preserves assignedUserId and chatStatus ──────────
  const contact = await prisma.contact.upsert({
    where: { whatsappId: remoteJid },
    create: {
      whatsappId: remoteJid,
      name: pushName ?? remoteJid,
      profilePhotoUrl: profilePicUrl ?? null,
    },
    update: {
      name: pushName ?? undefined,
      ...(profilePicUrl ? { profilePhotoUrl: profilePicUrl } : {}),
    },
  })

  // ── 2. Always persist inbound message for audit ──────────────────────────
  const rawMedia = extractMedia(message)
  let media: { mediaUrl: string; mediaType: string } | null = null
  if (rawMedia) {
    let base64 = rawMedia.base64
    let mimetype = rawMedia.mimetype
    // Evolution omits base64 in the webhook unless webhookBase64 is on, so
    // fetch the file content on demand using the message key.
    if (!base64) {
      const fetched = await fetchMediaBase64(key)
      if (fetched) {
        base64 = fetched.base64
        mimetype = fetched.mimetype ?? mimetype
      }
    }
    if (base64) media = await saveMediaFromBase64(base64, mimetype, rawMedia.fileName)
    else console.warn("[webhook] mídia recebida sem base64 e não foi possível obter via API:", rawMedia.mimetype)
  }

  // Dedupe por whatsappKeyId (chave única). Se a Evolution reenviar este
  // webhook (timeout dela, restart nosso), o create falha por unique violation
  // e ignoramos silenciosamente — mensagem NUNCA aparece 2x na tela.
  let saved
  try {
    saved = await prisma.message.create({
      data: {
        body: messageText,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.DELIVERED,
        contactId: contact.id,
        whatsappKeyId: key.id,
        ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
      },
    })
  } catch (err) {
    // P2002 = unique constraint. Mensagem já foi gravada por uma chamada
    // anterior; trabalho duplicado, descartamos.
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      console.log(`[webhook] duplicata ignorada keyId=${key.id}`)
      return
    }
    throw err
  }

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

  // ── 3. Routing: assigned contact bypasses URA entirely ───────────────────
  if (contact.assignedUserId !== null) {
    if (contact.chatStatus !== ChatStatus.IN_SERVICE) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { chatStatus: ChatStatus.IN_SERVICE },
      })
    }
    return
  }

  // ── 4. No owner → enfileira URA na fila durável.
  // ANTES: await handleUra() inline — bloqueava o webhook e perdia tudo se o
  // processo morresse. AGORA: job persistido no Redis. Worker dedicado
  // processa e sobrevive a restart (replay no boot).
  await enqueueInbound({
    whatsappKeyId: key.id,
    whatsappId: contact.whatsappId,
    messageText,
    contactName: contact.name,
  })
}

// ─── Delivery/Read receipts → CampaignLog ────────────────────────────────────

interface EvolutionStatusUpdate {
  keyId?: string
  key?: { id?: string }
  status?: string
  update?: { status?: string }
}

const STATUS_RANK: Record<string, number> = { PENDING: 0, SENT: 1, FAILED: 1, DELIVERED: 2, READ: 3 }

async function handleMessageStatusUpdate(data: EvolutionStatusUpdate): Promise<void> {
  const keyId = data.keyId ?? data.key?.id
  const status = (data.status ?? data.update?.status ?? "").toUpperCase()
  if (!keyId || !status) return

  const isRead = status === "READ" || status === "PLAYED"
  const isDelivered = status === "DELIVERY_ACK" || status === "DELIVERED"
  if (!isRead && !isDelivered) return

  const log = await prisma.campaignLog.findFirst({
    where: { messageKeyId: keyId },
    select: { id: true, status: true, deliveredAt: true },
  })
  if (!log) return

  const currentRank = STATUS_RANK[log.status] ?? 0
  const now = new Date()

  if (isRead && currentRank < STATUS_RANK.READ) {
    await prisma.campaignLog.update({
      where: { id: log.id },
      data: { status: "READ", readAt: now, deliveredAt: log.deliveredAt ?? now },
    })
  } else if (isDelivered && currentRank < STATUS_RANK.DELIVERED) {
    await prisma.campaignLog.update({
      where: { id: log.id },
      data: { status: "DELIVERED", deliveredAt: now },
    })
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

function isAuthorizedWebhook(request: NextRequest): boolean {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET
  if (!expected) {
    // Secret not configured — allow but warn. Configure EVOLUTION_WEBHOOK_SECRET
    // + WEBHOOK_GLOBAL_HEADER_APIKEY in the Evolution container for production hardening.
    console.warn("[webhook] EVOLUTION_WEBHOOK_SECRET não configurado — aceitando sem verificação.")
    return true
  }
  const received = request.headers.get("apikey") ?? ""
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedWebhook(request)) {
    // CRITICAL: se a Evolution está mandando webhook e o secret bate fora,
    // toda inbound vira 403 silenciosamente. Loga loud pra aparecer em
    // qualquer monitor de logs ANTES de o cliente reclamar.
    console.error("[CRITICAL] webhook 403 — EVOLUTION_WEBHOOK_SECRET mismatch", {
      ip: request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip"),
      receivedKeyLength: (request.headers.get("apikey") ?? "").length,
      hasExpected: !!process.env.EVOLUTION_WEBHOOK_SECRET,
      at: new Date().toISOString(),
    })
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let payload: EvolutionWebhookPayload

  try {
    payload = (await request.json()) as EvolutionWebhookPayload
  } catch {
    return NextResponse.json({ received: false, error: "Invalid JSON body" }, { status: 200 })
  }

  try {
    if (payload.event === "messages.update") {
      const updates = (Array.isArray(payload.data) ? payload.data : [payload.data]) as EvolutionStatusUpdate[]
      await Promise.all(updates.map((u) => handleMessageStatusUpdate(u)))
      return NextResponse.json({ received: true, processed: true, event: payload.event }, { status: 200 })
    }

    if (payload.event !== "messages.upsert") {
      return NextResponse.json({ received: true, processed: false, event: payload.event }, { status: 200 })
    }

    const messages = Array.isArray(payload.data)
      ? payload.data
      : [payload.data]

    await Promise.all(messages.map((msg) => handleMessagesUpsert(msg)))

    return NextResponse.json(
      { received: true, processed: true, count: messages.length },
      { status: 200 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"

    console.error("[webhook/evolution] Processing error:", { event: payload.event, error: message })

    return NextResponse.json(
      { received: true, processed: false, error: message },
      { status: 200 }
    )
  }
}

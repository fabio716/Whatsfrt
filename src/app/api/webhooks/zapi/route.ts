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
import { safeFetchBuffer } from "@/lib/safeFetch"
import { enqueueInbound } from "@/lib/reliability/queue"
import { applyRating, parseRating } from "@/lib/serviceTracking"
import { sendTextOk } from "@/lib/whatsapp"
import { findOrCreateContact } from "@/lib/contactLookup"
import { sendPushToUsers } from "@/lib/push"

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
  // referenceMessageId: presente quando a mensagem é uma RESPOSTA (quote) a
  // outra — a Z-API varia onde coloca o campo, então aceitamos os dois lugares.
  referenceMessageId?: string
  text?: { message: string; referenceMessageId?: string }
  image?: { imageUrl?: string; mimeType?: string; caption?: string; thumbnailUrl?: string }
  video?: { videoUrl?: string; mimeType?: string; caption?: string }
  audio?: { audioUrl?: string; mimeType?: string }
  document?: { documentUrl?: string; mimeType?: string; fileName?: string; caption?: string }
  // Cliente compartilhou um contato do WhatsApp (cartão de visita/vCard) —
  // sem tratar isso a mensagem chegava sem body e sem media, virando um
  // balão vazio na tela do agente.
  contact?: { displayName?: string; vcard?: string }
  contacts?: { displayName?: string; vcard?: string }[]
  // Presente quando o callback é uma REAÇÃO (não uma mensagem normal) — o
  // cliente reagiu com emoji numa mensagem nossa ou dele mesmo. value="" =
  // removeu a reação.
  reaction?: {
    value?: string
    referencedMessage?: { messageId?: string }
  }
}

interface ZapiStatusPayload {
  type: "MessageStatusCallback"
  // Z-API usa nomes diferentes entre versões. Aceitamos qualquer um:
  messageId?: string
  id?: string
  ids?: string[]
  phone: string
  status: "SENT" | "RECEIVED" | "DELIVERED" | "READ" | "VIEWED" | "PLAYED"
}

// Extrai o messageId aceitando os 3 formatos possíveis do Z-API
function extractStatusMessageId(p: ZapiStatusPayload): string | null {
  if (p.messageId) return p.messageId
  if (p.id) return p.id
  if (Array.isArray(p.ids) && p.ids.length > 0) return p.ids[0]
  return null
}

interface ZapiConnectionPayload {
  type: "DisconnectedCallback" | "ConnectedCallback"
  phone?: string
  connected?: boolean
}

type ZapiPayload = ZapiTextPayload | ZapiStatusPayload | ZapiConnectionPayload

// ─── Auth ────────────────────────────────────────────────────────────────────

// Autenticação do webhook Z-API.
//
// Política:
//   - Produção: ZAPI_WEBHOOK_SECRET é OBRIGATÓRIO. Sem ele, a rota REJEITA
//     todo request. Sem isso, qualquer pessoa que descubra a URL pode forjar
//     mensagens inbound e status updates em nome de qualquer telefone.
//   - Desenvolvimento: tolerante (aceita sem secret) pra facilitar testes
//     locais com curl/postman.
//
// Como Z-API não permite configurar header custom no webhook, suportamos
// 3 formas de receber o secret (ordem de preferência):
//   1. Header  X-Webhook-Secret              (se algum provider permitir)
//   2. Query string  ?key=THE_SECRET         ← Z-API: usar essa
//   3. Header  Client-Token                  (legado)
function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.ZAPI_WEBHOOK_SECRET

  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      console.error("[CRITICAL] ZAPI_WEBHOOK_SECRET ausente em producao — rejeitando webhook")
      return false
    }
    return true // dev OK sem secret
  }

  const url = new URL(request.url)
  const received =
    request.headers.get("x-webhook-secret") ??
    url.searchParams.get("key") ??
    request.headers.get("client-token") ??
    ""

  if (!received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Mascara um telefone pra log — mantem so os 4 ultimos digitos visiveis.
// Reduz exposicao de PII em logs centralizados (Datadog, Splunk, etc).
function maskPhone(p: string | undefined | null): string {
  if (!p) return "<vazio>"
  const stripped = p.replace(/@.*$/, "")
  if (stripped.length <= 4) return `***${stripped}`
  return `***${stripped.slice(-4)}`
}

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

// Extrai nome+telefone de um vCard (campo TEL, formato "waid=5511999999999"
// ou número puro depois dos dois-pontos). Best-effort — se não achar telefone,
// mostra só o nome.
function describeContact(c: { displayName?: string; vcard?: string }): string {
  const name = c.displayName?.trim() || "Contato sem nome"
  const waidMatch = c.vcard?.match(/waid=(\d+)/)
  const telMatch = c.vcard?.match(/TEL[^:]*:([+\d][\d\s()-]*\d)/)
  const phone = waidMatch?.[1] ?? telMatch?.[1]?.trim()
  return phone ? `👤 ${name} — ${phone}` : `👤 ${name}`
}

function extractContactsText(p: ZapiTextPayload): string | null {
  if (p.contact) return describeContact(p.contact)
  if (p.contacts?.length) return p.contacts.map(describeContact).join("\n")
  return null
}

function extractText(p: ZapiTextPayload): string {
  return p.text?.message
    ?? p.image?.caption
    ?? p.video?.caption
    ?? p.document?.caption
    ?? extractContactsText(p)
    ?? ""
}

async function downloadMediaToBuffer(url: string): Promise<Buffer | null> {
  // safeFetchBuffer aplica whitelist SSRF + timeout + limite de tamanho.
  return safeFetchBuffer(url)
}

// ─── Tipo: mensagem recebida ─────────────────────────────────────────────────

async function handleReceived(p: ZapiTextPayload): Promise<void> {
  // Ignora outbound nosso voltando em loop. Mesmo com dedupe, evita trabalho.
  if (p.fromMe === true) return

  // Reação do cliente (👍❤️😂😮😢🙏) numa mensagem — não é uma mensagem nova,
  // só atualiza theirReaction na mensagem referenciada e notifica a UI.
  const referencedId = p.reaction?.referencedMessage?.messageId
  if (referencedId) {
    const target = await prisma.message.findFirst({
      where: { whatsappKeyId: referencedId },
      select: { id: true, status: true, contactId: true, contact: { select: { assignedUserId: true } } },
    })
    if (target) {
      const theirReaction = p.reaction?.value?.trim() || null
      await prisma.message.update({ where: { id: target.id }, data: { theirReaction } })
      broadcast({
        type: "message_update",
        data: { id: target.id, status: target.status, contactId: target.contactId, theirReaction },
      }, target.contact.assignedUserId)
    }
    return
  }

  const whatsappId = toWhatsappId(p.phone, !!p.isGroup)
  const messageText = extractText(p)
  const pushName = p.senderName ?? p.chatName ?? whatsappId

  // 1 — Acha (considerando variante com/sem 9º dígito) ou cria contato
  const contact = await findOrCreateContact(whatsappId, {
    name: p.senderName,
    fallbackName: pushName,
    profilePhotoUrl: p.senderPhoto,
  })

  // 2 — Baixa mídia se houver, salva privado, gera mediaUrl interno.
  // Retry 1x: a URL da Z-API às vezes falha na primeira tentativa (CDN
  // ainda propagando). Se falhar de vez, a mensagem entra COM AVISO no
  // corpo — antes ficava uma bolha vazia/quebrada e ninguém sabia que o
  // cliente tinha mandado algo.
  let media: { mediaUrl: string; mediaType: string } | null = null
  let mediaLost = false
  const rawMedia = extractMediaUrl(p)
  if (rawMedia) {
    let buf = await downloadMediaToBuffer(rawMedia.url)
    if (!buf || buf.length === 0) {
      buf = await downloadMediaToBuffer(rawMedia.url)
    }
    if (buf && buf.length > 0) {
      try {
        const saved = await saveMediaBuffer(buf, rawMedia.mimetype, rawMedia.fileName)
        media = { mediaUrl: saved.mediaUrl, mediaType: saved.mediaType }
      } catch (err) {
        // Disco cheio (ENOSPC) ou erro de escrita: não derruba o webhook —
        // perder a mídia é ruim, perder a mensagem inteira é pior.
        mediaLost = true
        console.error(
          `[zapi-webhook] FALHA AO GRAVAR mídia no disco messageId=${p.messageId} ` +
          `tipo=${rawMedia.mimetype} tamanho=${buf.length} erro=${err instanceof Error ? err.message : String(err)}`,
        )
      }
    } else {
      mediaLost = true
      console.error(
        `[zapi-webhook] FALHA AO BAIXAR mídia (2 tentativas) messageId=${p.messageId} ` +
        `tipo=${rawMedia.mimetype} url=${rawMedia.url.slice(0, 120)}`,
      )
    }
  }

  // Cliente respondeu citando uma mensagem (quote do WhatsApp): localiza a
  // original pelo id do provedor e guarda o snapshot pra UI mostrar a citação.
  let quoted: { id: string; body: string; sender: string } | null = null
  const refId = p.referenceMessageId ?? p.text?.referenceMessageId
  if (refId) {
    const original = await prisma.message.findFirst({
      where: { whatsappKeyId: refId, contactId: contact.id },
      select: { id: true, body: true, direction: true, mediaType: true },
    })
    if (original) {
      const preview = original.body?.trim()
        || (original.mediaType?.startsWith("image/") ? "🖼️ Imagem"
          : original.mediaType?.startsWith("video/") ? "🎬 Vídeo"
          : original.mediaType?.startsWith("audio/") ? "🎤 Áudio"
          : original.mediaType ? "📎 Arquivo" : "")
      quoted = {
        id: original.id,
        body: preview.slice(0, 300),
        sender: original.direction === MessageDirection.INBOUND ? (contact.name || "Cliente") : "Você",
      }
    }
  }

  // Aviso visível no chat quando a mídia se perdeu.
  const mediaKind = rawMedia?.mimetype.startsWith("image/") ? "uma imagem"
    : rawMedia?.mimetype.startsWith("video/") ? "um vídeo"
    : rawMedia?.mimetype.startsWith("audio/") ? "um áudio"
    : "um arquivo"
  const finalText = mediaLost && !messageText
    ? `⚠️ O cliente enviou ${mediaKind}, mas não foi possível baixar. Peça para reenviar.`
    : messageText

  // 3 — Cria Message com dedupe por messageId (whatsappKeyId)
  let saved
  try {
    saved = await prisma.message.create({
      data: {
        body: finalText,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.DELIVERED,
        contactId: contact.id,
        whatsappKeyId: p.messageId,
        ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
        ...(quoted ? { quotedMsgId: quoted.id, quotedBody: quoted.body, quotedSender: quoted.sender } : {}),
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
      quotedMsgId: saved.quotedMsgId, quotedBody: saved.quotedBody, quotedSender: saved.quotedSender,
      contact: {
        id: contact.id, whatsappId: contact.whatsappId,
        name: contact.name, profilePhotoUrl: contact.profilePhotoUrl,
        chatStatus: contact.chatStatus,
        assignedUserId: contact.assignedUserId,
      },
    },
  })

  // 4b — Push real (funciona com o navegador fechado). Vai pro agente dono
  // do contato; sem dono ainda (fila), vai pra todos os admins.
  void (async () => {
    const targetIds = contact.assignedUserId
      ? [contact.assignedUserId]
      : (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((u) => u.id)
    await sendPushToUsers(targetIds, {
      title: contact.name || "Novo cliente",
      body: media ? "📎 Anexo" : finalText,
      tag: `chat-${contact.id}`,
      url: "/admin/chats",
    })
  })()

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

interface StatusUpdateResult {
  matched: boolean
  skipped?: string
  oldStatus?: string
  newStatus?: string
}

async function handleMessageStatus(p: ZapiStatusPayload): Promise<StatusUpdateResult> {
  const isRead = p.status === "READ" || p.status === "VIEWED" || p.status === "PLAYED"
  const isDelivered = p.status === "DELIVERED" || p.status === "RECEIVED"
  if (!isRead && !isDelivered) return { matched: false, skipped: `status=${p.status}` }

  const messageId = extractStatusMessageId(p)
  if (!messageId) return { matched: false, skipped: `no messageId in payload (keys: ${Object.keys(p).join(",")})` }

  const newStatus = isRead ? MessageStatus.READ : MessageStatus.DELIVERED

  // Recibos de TRANSMISSAO (CampaignLog): campanhas so criam linha em CampaignLog,
  // nunca em Message. Por isso atualizamos aqui ANTES de procurar a Message —
  // senao o recibo batia no early-return de "Message nao encontrada" e a
  // transmissao ficava eternamente como "nao recebido".
  // Guarda de ordem: um DELIVERED atrasado nao rebaixa um log ja em READ.
  const campaignUpd = await prisma.campaignLog.updateMany({
    where: isRead
      ? { messageKeyId: messageId }
      : { messageKeyId: messageId, status: { not: "READ" } },
    data: isRead
      ? { status: "READ", readAt: new Date(), deliveredAt: new Date() }
      : { status: "DELIVERED", deliveredAt: new Date() },
  })

  const message = await prisma.message.findFirst({
    where: { whatsappKeyId: messageId },
    select: {
      id: true,
      contactId: true,
      status: true,
      contact: { select: { whatsappId: true } },
    },
  })
  if (!message) {
    // Sem Message de chat: se o recibo bateu numa transmissao, foi sucesso.
    if (campaignUpd.count > 0) return { matched: true, newStatus }
    return { matched: false, skipped: `messageId=${messageId} not found in DB` }
  }

  // Anti-spoofing relaxado: o campo p.phone do Z-API nem sempre eh o
  // destinatario (pode vir como phoneDevice/sender em alguns callbacks).
  // Em vez de REJEITAR o update, apenas logamos warning quando diferente.
  // Defesa principal eh o secret de webhook (so o Z-API consegue chamar);
  // o phone-check seria reforco que pode causar falsos negativos.
  const expectedPhone = message.contact.whatsappId.replace(/@.*$/, "")
  const receivedPhone = (p.phone ?? "").replace(/@.*$/, "")
  if (receivedPhone && expectedPhone && receivedPhone !== expectedPhone) {
    console.warn(`[zapi-webhook] phone mismatch (nao bloqueando) messageId=${messageId} expected=${maskPhone(expectedPhone)} got=${maskPhone(receivedPhone)}`)
  }

  const ranks: Record<string, number> = { PENDING: 0, SENT: 1, FAILED: 1, DELIVERED: 2, READ: 3 }
  if ((ranks[newStatus] ?? 0) <= (ranks[message.status] ?? 0)) {
    return { matched: true, skipped: `already at ${message.status}`, oldStatus: message.status, newStatus }
  }

  await prisma.message.update({
    where: { id: message.id },
    data: { status: newStatus },
  })

  broadcast({
    type: "message_update",
    data: { id: message.id, status: newStatus, contactId: message.contactId },
  })

  return { matched: true, oldStatus: message.status, newStatus }
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

  // Log estratégico — todo webhook que chega aparece aqui pra debug.
  if (payload.type === "MessageStatusCallback") {
    const p = payload as ZapiStatusPayload
    console.log(`[zapi-webhook] type=MessageStatusCallback status=${p.status} messageId=${extractStatusMessageId(p)} (raw keys: ${Object.keys(p).join(",")})`)
  } else if (payload.type === "ReceivedCallback") {
    console.log(`[zapi-webhook] type=ReceivedCallback from=${maskPhone((payload as ZapiTextPayload).phone)}`)
  } else {
    console.log(`[zapi-webhook] type=${payload.type}`)
  }

  try {
    switch (payload.type) {
      case "ReceivedCallback":
        await handleReceived(payload)
        return NextResponse.json({ received: true, processed: true, event: payload.type })

      case "MessageStatusCallback": {
        const result = await handleMessageStatus(payload)
        console.log(`[zapi-webhook] status update result:`, result)
        return NextResponse.json({ received: true, processed: true, event: payload.type, ...result })
      }

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

import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { ChatStatus, MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { sendEvolutionText } from "@/lib/evolution"
import { getUraConfigCached } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"

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

function normalizeRemoteJid(remoteJid: string): string | null {
  // Ignora @lid (IDs internos do WhatsApp Business/linked devices)
  if (remoteJid.includes("@lid")) return null
  return remoteJid.replace(/@(s\.whatsapp\.net|g\.us|c\.us)$/, "").concat(
    remoteJid.endsWith("@g.us") ? "@g.us" : "@s.whatsapp.net"
  )
}

// ─── Media helper ────────────────────────────────────────────────────────────

async function saveMediaFromBase64(
  base64: string,
  mimetype: string,
  fileName?: string
): Promise<{ mediaUrl: string; mediaType: string } | null> {
  try {
    const ext = (mimetype.split("/")[1] ?? "bin").split(";")[0]
    const safeName = fileName
      ? `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`
      : `${Date.now()}.${ext}`
    const uploadsDir = path.join(process.cwd(), "public", "uploads")
    await fs.mkdir(uploadsDir, { recursive: true })
    await fs.writeFile(path.join(uploadsDir, safeName), Buffer.from(base64, "base64"))
    return { mediaUrl: `/uploads/${safeName}`, mediaType: mimetype }
  } catch (err) {
    console.error("[webhook] saveMediaFromBase64 error:", err)
    return null
  }
}

function extractMedia(
  message?: EvolutionMessageContent
): { base64: string; mimetype: string; fileName?: string } | null {
  if (!message) return null
  const candidates = [
    message.imageMessage,
    message.videoMessage,
    message.documentMessage,
    message.audioMessage,
    message.stickerMessage,
  ]
  for (const m of candidates) {
    if (m?.base64 && m.mimetype) {
      return { base64: m.base64, mimetype: m.mimetype, fileName: m.fileName }
    }
  }
  return null
}


// ─── Contact shape used internally ───────────────────────────────────────────

type ContactSnapshot = {
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: ChatStatus
  assignedUserId: string | null
}

// ─── Helper: broadcast + save outbound URA message ───────────────────────────

async function sendUraMessage(contact: ContactSnapshot, text: string): Promise<void> {
  const ok = await sendEvolutionText(contact.whatsappId, text)
  const saved = await prisma.message.create({
    data: {
      body: text,
      direction: MessageDirection.OUTBOUND,
      status: ok ? MessageStatus.SENT : MessageStatus.FAILED,
      contactId: contact.id,
    },
  })
  broadcast({
    type: "new_message",
    data: {
      id: saved.id, body: saved.body, direction: saved.direction,
      status: saved.status, createdAt: saved.createdAt.toISOString(),
      agentId: null, contactId: contact.id, contact,
    },
  })
}

// ─── URA State Machine ───────────────────────────────────────────────────────

async function handleUra(contact: ContactSnapshot, inboundText: string): Promise<void> {
  if (contact.whatsappId.endsWith("@g.us")) return

  const cfg = await getUraConfigCached()
  if (!cfg.isActive) return

  const optionMap = Object.fromEntries(cfg.options.map((o) => [o.digit, o.label]))

  if (contact.chatStatus === ChatStatus.IDLE) {
    const bizStatus = isBusinessHour(cfg)

    if (bizStatus === "CLOSED") {
      if (cfg.outOfOfficeMessage) await sendUraMessage(contact, cfg.outOfOfficeMessage)
      return // keep IDLE — re-check on next message
    }

    if (bizStatus === "LUNCH") {
      if (cfg.lunchMessage) await sendUraMessage(contact, cfg.lunchMessage)
      return // keep IDLE
    }

    await prisma.contact.update({ where: { id: contact.id }, data: { chatStatus: ChatStatus.IN_URA } })
    await sendUraMessage(contact, cfg.greetingText)
    return
  }

  if (contact.chatStatus === ChatStatus.IN_URA) {
    const option = inboundText.trim()
    const label = optionMap[option]
    if (label) {
      await prisma.contact.update({ where: { id: contact.id }, data: { chatStatus: ChatStatus.WAITING_AGENT } })
      await sendUraMessage(
        contact,
        `✅ Você selecionou *${label}*.\nUm agente irá te atender em breve. Aguarde! 🙏`
      )
    } else {
      await sendUraMessage(contact, `⚠️ Opção inválida. Por favor, escolha:\n\n${cfg.greetingText}`)
    }
  }
  // WAITING_AGENT / IN_SERVICE: message already saved; nothing else to do.
}

// ─── Handler ─────────────────────────────────────────────────────────────────

async function handleMessagesUpsert(messageData: EvolutionMessageData): Promise<void> {
  const { key, pushName, message, profilePicUrl } = messageData

  // Outbound messages from Evolution API (fromMe) are handled by /api/messages/send
  // or by sendUraMessage — skip to avoid duplicates.
  if (key.fromMe) {
    console.log(`[webhook] Ignorando fromMe: ${key.remoteJid}`)
    return
  }

  const remoteJid = normalizeRemoteJid(key.remoteJid)
  if (!remoteJid) {
    console.log(`[webhook] Ignorando @lid JID: ${key.remoteJid}`)
    return
  }
  console.log(`[webhook] Processando mensagem de: ${remoteJid}`)

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
  const media = rawMedia ? await saveMediaFromBase64(rawMedia.base64, rawMedia.mimetype, rawMedia.fileName) : null

  const saved = await prisma.message.create({
    data: {
      body: messageText,
      direction: MessageDirection.INBOUND,
      status: MessageStatus.DELIVERED,
      contactId: contact.id,
      ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
    },
  })

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
    // Contact already has an owner (migrated from individual number).
    // Ensure status is IN_SERVICE and skip URA menu.
    if (contact.chatStatus !== ChatStatus.IN_SERVICE) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { chatStatus: ChatStatus.IN_SERVICE },
      })
    }
    return
  }

  // ── 4. No owner → normal URA triage ─────────────────────────────────────
  await handleUra(contact, messageText)
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let payload: EvolutionWebhookPayload

  try {
    payload = (await request.json()) as EvolutionWebhookPayload
    console.log("🔔 Webhook Recebido:", JSON.stringify({ event: payload.event, instance: payload.instance }))
  } catch {
    return NextResponse.json({ received: false, error: "Invalid JSON body" }, { status: 200 })
  }

  try {
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

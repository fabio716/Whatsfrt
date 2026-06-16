import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads")

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024 // 16 MB, limite WhatsApp para mídia comum
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"]
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
])
// SVG é image/* mas pode conter scripts. Servimos uploads em /public, então é XSS.
const BLOCKED_MIME = new Set(["image/svg+xml", "text/html", "application/xhtml+xml"])

function isMimeAllowed(mime: string): boolean {
  if (BLOCKED_MIME.has(mime)) return false
  if (ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true
  return ALLOWED_MIME_EXACT.has(mime)
}

function evolutionMediaType(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "image"
  if (mimetype.startsWith("video/")) return "video"
  if (mimetype.startsWith("audio/")) return "audio"
  return "document"
}

function resolvePublicBaseUrl(): string | null {
  const explicit = process.env.APP_PUBLIC_URL
  if (explicit) return explicit.replace(/\/$/, "")
  const webhook = process.env.EVOLUTION_WEBHOOK_URL
  if (webhook) {
    try {
      return new URL(webhook).origin
    } catch {
      return null
    }
  }
  return null
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const file      = formData.get("file") as File | null
  const contactId = formData.get("contactId") as string | null
  const caption   = (formData.get("caption") as string | null) ?? ""

  if (!file || !contactId) {
    return NextResponse.json({ error: "file e contactId são obrigatórios" }, { status: 400 })
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Arquivo excede ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` },
      { status: 413 }
    )
  }

  const mediaType = file.type || "application/octet-stream"
  if (!isMimeAllowed(mediaType)) {
    return NextResponse.json({ error: `Tipo de arquivo não permitido: ${mediaType}` }, { status: 415 })
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  if (session.role === "AGENT" && contact.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }

  if (contact.whatsappId.includes("@lid")) {
    return NextResponse.json({
      error: "Não é possível enviar para este contato. O número não é um telefone válido (formato @lid).",
    }, { status: 400 })
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const filePath = path.join(UPLOADS_DIR, safeName)
  const mediaUrl = `/uploads/${safeName}`

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.writeFile(filePath, buffer)

  let finalStatus: MessageStatus = MessageStatus.PENDING
  const msg = await prisma.message.create({
    data: {
      body: caption,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.PENDING,
      contactId,
      agentId: session.id,
      mediaUrl,
      mediaType,
    },
  })

  const apiUrl  = process.env.EVOLUTION_API_URL
  const apiKey  = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  if (apiUrl && apiKey && instance) {
    try {
      const number = contact.whatsappId.endsWith("@g.us")
        ? contact.whatsappId
        : contact.whatsappId.replace(/@.*/, "")

      const publicBase = resolvePublicBaseUrl()
      const media = publicBase ? `${publicBase}${mediaUrl}` : buffer.toString("base64")

      const res = await fetch(`${apiUrl}/message/sendMedia/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          number,
          mediatype: evolutionMediaType(mediaType),
          mimetype: mediaType,
          caption,
          media,
          fileName: file.name,
        }),
      })
      if (res.ok) {
        finalStatus = MessageStatus.SENT
      } else {
        console.error("[SEND MEDIA ERROR] Falha Evolution API:", res.status, await res.text())
        finalStatus = MessageStatus.FAILED
      }
    } catch (err) {
      console.error("[SEND MEDIA EXCEPTION]:", err)
      finalStatus = MessageStatus.FAILED
    }
  } else {
    console.error("[SEND MEDIA ERROR] Variáveis de ambiente ausentes")
    finalStatus = MessageStatus.FAILED
  }

  await prisma.message.update({ where: { id: msg.id }, data: { status: finalStatus } })

  broadcast({
    type: "new_message",
    data: {
      id: msg.id, body: caption, direction: "OUTBOUND",
      status: finalStatus, createdAt: msg.createdAt.toISOString(),
      agentId: session.id, contactId,
      mediaUrl, mediaType,
      contact: {
        id: contact.id, whatsappId: contact.whatsappId,
        name: contact.name, profilePhotoUrl: contact.profilePhotoUrl,
        chatStatus: contact.chatStatus,
        assignedUserId: contact.assignedUserId,
      },
    },
  })

  return NextResponse.json({ id: msg.id, status: finalStatus, mediaUrl }, { status: 201 })
}

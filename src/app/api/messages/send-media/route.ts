import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { evolutionFetch } from "@/lib/reliability/evolutionFetch"
import { resolvePublicBaseUrl } from "@/lib/evolution"
import {
  isMimeAllowed,
  MAX_UPLOAD_BYTES,
  saveMediaBuffer,
  signMediaUrl,
} from "@/lib/mediaStorage"

function evolutionMediaType(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "image"
  if (mimetype.startsWith("video/")) return "video"
  if (mimetype.startsWith("audio/")) return "audio"
  return "document"
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const clientKey = request.headers.get("idempotency-key") ?? null

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

  // Curto-circuito idempotente ANTES de gravar o arquivo no disco.
  if (clientKey) {
    const existing = await prisma.message.findUnique({
      where: { clientKey },
      select: { id: true, status: true, mediaUrl: true },
    })
    if (existing) {
      return NextResponse.json({
        id: existing.id, status: existing.status, mediaUrl: existing.mediaUrl, idempotent: true,
      })
    }
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

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const saved = await saveMediaBuffer(buffer, mediaType, file.name)
  const mediaUrl = saved.mediaUrl

  let msg
  try {
    msg = await prisma.message.create({
      data: {
        body: caption,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.PENDING,
        contactId,
        agentId: session.id,
        clientKey,
        attempts: 0,
        mediaUrl,
        mediaType,
      },
    })
  } catch (err) {
    if (clientKey && err && typeof err === "object" && "code" in err && err.code === "P2002") {
      const existing = await prisma.message.findUnique({
        where: { clientKey },
        select: { id: true, status: true, mediaUrl: true },
      })
      if (existing) return NextResponse.json({
        id: existing.id, status: existing.status, mediaUrl: existing.mediaUrl, idempotent: true,
      })
    }
    throw err
  }

  const apiUrl  = process.env.EVOLUTION_API_URL
  const apiKey  = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  let finalStatus: MessageStatus = MessageStatus.PENDING
  let attempts = 0
  let errorMsg: string | null = null

  if (apiUrl && apiKey && instance) {
    const number = contact.whatsappId.endsWith("@g.us")
      ? contact.whatsappId
      : contact.whatsappId.replace(/@.*/, "")

    const publicBase = resolvePublicBaseUrl()
    const media = publicBase
      ? `${publicBase}/api/media/${saved.filename}?${signMediaUrl(saved.filename, 300).queryString}`
      : buffer.toString("base64")

    const res = await evolutionFetch(`${apiUrl}/message/sendMedia/${instance}`, {
      label: "send-media",
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
    attempts = res.attempts
    if (res.ok) finalStatus = MessageStatus.SENT
    else {
      finalStatus = MessageStatus.FAILED
      errorMsg = res.lastError ?? `status ${res.status}`
    }
  } else {
    finalStatus = MessageStatus.FAILED
    errorMsg = "env Evolution ausente"
  }

  await prisma.message.update({
    where: { id: msg.id },
    data: { status: finalStatus, attempts, errorMsg },
  })

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

  return NextResponse.json({
    id: msg.id, status: finalStatus, mediaUrl,
    attempts, error: errorMsg,
  }, { status: finalStatus === MessageStatus.SENT ? 201 : 502 })
}

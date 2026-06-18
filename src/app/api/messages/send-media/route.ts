import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { sendMedia as sendWhatsAppMedia } from "@/lib/whatsapp"
import { validatePhoneCached } from "@/lib/whatsappValidation"
import {
  isMimeAllowed,
  MAX_UPLOAD_BYTES,
  saveMediaBuffer,
} from "@/lib/mediaStorage"

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
      { error: `Arquivo excede o limite de ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.` },
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

  // Valida número no WhatsApp antes de processar a mídia (evita upload em vão).
  if (!contact.whatsappId.endsWith("@g.us")) {
    const recentInbound = await prisma.message.count({
      where: {
        contactId,
        direction: MessageDirection.INBOUND,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    })
    if (recentInbound === 0) {
      const validated = await validatePhoneCached(contact.whatsappId)
      if (validated === false) {
        return NextResponse.json({
          error: "Este número não está cadastrado no WhatsApp. A mídia não vai chegar — confirme o número com o cliente.",
          code: "INVALID_WHATSAPP_NUMBER",
        }, { status: 422 })
      }
    }
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

  // Envia via provider ativo (Evolution OU Z-API). O dispatcher gera URL
  // assinada do nosso /api/media + fallback pra base64 se não houver APP_PUBLIC_URL.
  const sendResult = await sendWhatsAppMedia({
    whatsappId: contact.whatsappId,
    filename: saved.filename,
    mimetype: mediaType,
    caption,
    fileName: file.name,
    rawBase64: buffer.toString("base64"),
  })
  const finalStatus: MessageStatus = sendResult.ok ? MessageStatus.SENT : MessageStatus.FAILED
  const attempts = sendResult.attempts
  const errorMsg = sendResult.ok ? null : sendResult.errorMsg

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

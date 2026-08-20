import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { sendText, sendMedia } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// Extrai o filename salvo em disco a partir da URL pública /api/media/<nome>.
function filenameFromMediaUrl(url: string): string {
  return url.replace(/^\/api\/media\//, "").replace(/\?.*$/, "")
}

interface SendPart {
  id: string
  status: string
  mediaUrl?: string | null
  mediaType?: string | null
  error?: string | null
}

// POST /api/quick-replies/send — dispara um template (texto → imagem/vídeo →
// áudio) num contato, em sequência com um pequeno delay entre partes — igual
// mandar manualmente, só que com 1 clique. Áudio usa o mesmo pipeline de
// envio do gravador do Chats (Z-API já entrega como nota de voz/PTT).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  let body: { contactId?: string; templateId?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const { contactId, templateId } = body
  if (!contactId || !templateId) {
    return NextResponse.json({ error: "contactId e templateId são obrigatórios" }, { status: 400 })
  }

  const [contact, template] = await Promise.all([
    prisma.contact.findUnique({ where: { id: contactId, deletedAt: null } }),
    prisma.quickReplyTemplate.findUnique({ where: { id: templateId, isActive: true } }),
  ])
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  if (!template) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 })

  if (session.role === "AGENT" && contact.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }
  if (contact.whatsappId.includes("@lid")) {
    return NextResponse.json({ error: "Não é possível enviar para este contato (formato @lid)" }, { status: 400 })
  }

  const parts: SendPart[] = []
  const ssePrivacyOwner = contact.assignedUserId

  const broadcastNew = async (data: { body: string; mediaUrl: string | null; mediaType: string | null }) => {
    const message = await prisma.message.create({
      data: {
        body: data.body,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.PENDING,
        contactId: contact!.id,
        agentId: session.id,
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
      },
    })
    broadcast({
      type: "new_message",
      data: {
        id: message.id, body: message.body, direction: message.direction,
        status: message.status, createdAt: message.createdAt.toISOString(),
        agentId: session.id, contactId: contact!.id,
        mediaUrl: message.mediaUrl, mediaType: message.mediaType,
        contact: {
          id: contact!.id, whatsappId: contact!.whatsappId, name: contact!.name,
          profilePhotoUrl: contact!.profilePhotoUrl, chatStatus: contact!.chatStatus,
          assignedUserId: contact!.assignedUserId,
        },
      },
    }, ssePrivacyOwner)
    return message
  }

  const broadcastUpdate = (id: string, status: MessageStatus) => {
    broadcast({ type: "message_update", data: { id, status, contactId: contact!.id } }, ssePrivacyOwner)
  }

  // 1 — Texto (com personalização {nome}, mesma convenção do Campaign)
  if (template.text.trim()) {
    const text = template.text.replace(/\{nome\}/gi, contact.name)
    const message = await broadcastNew({ body: text, mediaUrl: null, mediaType: null })
    const result = await sendText(contact.whatsappId, text)
    const finalStatus = result.ok ? MessageStatus.SENT : MessageStatus.FAILED
    await prisma.message.update({
      where: { id: message.id },
      data: { status: finalStatus, errorMsg: result.ok ? null : result.errorMsg, ...(result.messageId ? { whatsappKeyId: result.messageId } : {}) },
    })
    broadcastUpdate(message.id, finalStatus)
    parts.push({ id: message.id, status: finalStatus, error: result.errorMsg })
    if (template.mediaUrl || template.audioUrl) await delay(1500)
  }

  // 2 — Imagem/vídeo
  if (template.mediaUrl && template.mediaType) {
    const message = await broadcastNew({ body: "", mediaUrl: template.mediaUrl, mediaType: template.mediaType })
    const result = await sendMedia({
      whatsappId: contact.whatsappId,
      filename: filenameFromMediaUrl(template.mediaUrl),
      mimetype: template.mediaType,
    })
    const finalStatus = result.ok ? MessageStatus.SENT : MessageStatus.FAILED
    await prisma.message.update({
      where: { id: message.id },
      data: { status: finalStatus, errorMsg: result.ok ? null : result.errorMsg, ...(result.messageId ? { whatsappKeyId: result.messageId } : {}) },
    })
    broadcastUpdate(message.id, finalStatus)
    parts.push({ id: message.id, status: finalStatus, mediaUrl: template.mediaUrl, mediaType: template.mediaType, error: result.errorMsg })
    if (template.audioUrl) await delay(1500)
  }

  // 3 — Áudio (nota de voz)
  if (template.audioUrl && template.audioType) {
    const message = await broadcastNew({ body: "", mediaUrl: template.audioUrl, mediaType: template.audioType })
    const result = await sendMedia({
      whatsappId: contact.whatsappId,
      filename: filenameFromMediaUrl(template.audioUrl),
      mimetype: template.audioType,
    })
    const finalStatus = result.ok ? MessageStatus.SENT : MessageStatus.FAILED
    await prisma.message.update({
      where: { id: message.id },
      data: { status: finalStatus, errorMsg: result.ok ? null : result.errorMsg, ...(result.messageId ? { whatsappKeyId: result.messageId } : {}) },
    })
    broadcastUpdate(message.id, finalStatus)
    parts.push({ id: message.id, status: finalStatus, mediaUrl: template.audioUrl, mediaType: template.audioType, error: result.errorMsg })
  }

  // Contato respondendo = atendendo. Mesma promoção feita em /api/messages/send.
  if (contact.chatStatus === "IDLE" && contact.assignedUserId) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { chatStatus: "IN_SERVICE", inServiceSince: contact.inServiceSince ?? new Date() },
    })
  }

  const anyFailed = parts.some((p) => p.status === "FAILED")
  return NextResponse.json({ parts, ok: !anyFailed }, { status: anyFailed ? 502 : 200 })
}

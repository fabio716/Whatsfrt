import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { deleteMessage } from "@/lib/whatsapp"

const DELETED_PLACEHOLDER = "🚫 Mensagem apagada"

// DELETE /api/messages/[id] — apaga (pra todos) uma mensagem OUTBOUND já
// enviada. Só o próprio autor (ou o admin) pode apagar. Depende do provedor
// suportar exclusão (Z-API sim, dentro da janela que o WhatsApp permite).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth
  const { id } = await params

  const message = await prisma.message.findUnique({
    where: { id },
    include: { contact: true },
  })
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })

  if (message.direction !== MessageDirection.OUTBOUND) {
    return NextResponse.json({ error: "Só é possível apagar mensagens enviadas por você" }, { status: 400 })
  }
  if (session.role === "AGENT" && message.agentId !== session.id) {
    return NextResponse.json({ error: "Você só pode apagar suas próprias mensagens" }, { status: 403 })
  }
  if (!message.whatsappKeyId) {
    return NextResponse.json({ error: "Mensagem antiga demais pra apagar (sem referência do WhatsApp)" }, { status: 400 })
  }

  const result = await deleteMessage(message.contact.whatsappId, message.whatsappKeyId)
  if (!result.ok) {
    return NextResponse.json({
      error: result.errorMsg ?? "O WhatsApp recusou apagar (provavelmente passou da janela de tempo permitida)",
    }, { status: 502 })
  }

  const updated = await prisma.message.update({
    where: { id },
    data: { body: DELETED_PLACEHOLDER, mediaUrl: null, mediaType: null },
  })

  broadcast({
    type: "message_update",
    data: {
      id: updated.id,
      status: updated.status,
      contactId: updated.contactId,
      body: updated.body,
      mediaUrl: null,
      mediaType: null,
    },
  }, message.contact.assignedUserId)

  return NextResponse.json({ id: updated.id, body: updated.body })
}

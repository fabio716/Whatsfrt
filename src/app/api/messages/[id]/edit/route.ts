import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { editText } from "@/lib/whatsapp"

interface EditBody {
  text: string
}

// PATCH /api/messages/[id]/edit — edita o texto de uma mensagem OUTBOUND já
// enviada. Só o próprio autor (ou o admin) pode editar. Depende do provedor
// suportar edição (Z-API sim, dentro da janela que o WhatsApp permite — em
// geral só alguns minutos após o envio; passado isso, o provedor recusa e
// devolvemos o erro dele).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth
  const { id } = await params

  let body: EditBody
  try {
    body = (await request.json()) as EditBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 })

  const message = await prisma.message.findUnique({
    where: { id },
    include: { contact: true },
  })
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })

  if (message.direction !== MessageDirection.OUTBOUND) {
    return NextResponse.json({ error: "Só é possível editar mensagens enviadas por você" }, { status: 400 })
  }
  if (session.role === "AGENT" && message.agentId !== session.id) {
    return NextResponse.json({ error: "Você só pode editar suas próprias mensagens" }, { status: 403 })
  }
  if (!message.whatsappKeyId) {
    return NextResponse.json({ error: "Mensagem antiga demais pra editar (sem referência do WhatsApp)" }, { status: 400 })
  }

  const result = await editText(message.contact.whatsappId, text, message.whatsappKeyId)
  if (!result.ok) {
    return NextResponse.json({
      error: result.errorMsg ?? "O WhatsApp recusou a edição (provavelmente passou da janela de tempo permitida)",
    }, { status: 502 })
  }

  const updated = await prisma.message.update({
    where: { id },
    data: { body: text },
  })

  broadcast({
    type: "message_update",
    data: { id: updated.id, status: updated.status, contactId: updated.contactId, body: updated.body },
  }, message.contact.assignedUserId)

  return NextResponse.json({ id: updated.id, body: updated.body })
}

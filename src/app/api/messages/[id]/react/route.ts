import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { sendReaction } from "@/lib/whatsapp"

interface ReactBody {
  emoji: string | null // null/"" remove a reação
}

// PATCH /api/messages/[id]/react — reage (ou remove reação) numa mensagem do
// chat com o cliente, estilo WhatsApp. Qualquer agente dono do contato (ou
// admin) pode reagir a QUALQUER mensagem da conversa — não só a própria,
// igual reagir no WhatsApp de verdade.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth
  const { id } = await params

  let body: ReactBody
  try {
    body = (await request.json()) as ReactBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const emoji = body.emoji?.trim() || null

  const message = await prisma.message.findUnique({
    where: { id },
    include: { contact: true },
  })
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })

  if (session.role === "AGENT" && message.contact.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }
  if (!message.whatsappKeyId) {
    return NextResponse.json({ error: "Mensagem antiga demais pra reagir (sem referência do WhatsApp)" }, { status: 400 })
  }

  const result = await sendReaction(message.contact.whatsappId, message.whatsappKeyId, emoji ?? "")
  if (!result.ok) {
    return NextResponse.json({ error: result.errorMsg ?? "Não foi possível reagir" }, { status: 502 })
  }

  const updated = await prisma.message.update({
    where: { id },
    data: { myReaction: emoji },
    select: { id: true, status: true, contactId: true, myReaction: true },
  })

  broadcast({
    type: "message_update",
    data: { id: updated.id, status: updated.status, contactId: updated.contactId, myReaction: updated.myReaction },
  }, message.contact.assignedUserId)

  return NextResponse.json({ id: updated.id, myReaction: updated.myReaction })
}

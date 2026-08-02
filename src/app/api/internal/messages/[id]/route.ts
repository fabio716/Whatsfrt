import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

interface EditBody {
  text: string
}

// PATCH /api/internal/messages/[id] — edita o texto de uma mensagem do chat
// interno. Só o próprio autor pode editar, e só texto puro (sem mídia). Não
// passa pelo WhatsApp/Z-API — é só um texto interno, edição é direta no banco.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const { id } = await params

  let body: EditBody
  try {
    body = (await request.json()) as EditBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const text = body.text?.trim()
  if (!text) return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 })

  const message = await prisma.internalMessage.findUnique({ where: { id } })
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })

  if (message.senderId !== me.id) {
    return NextResponse.json({ error: "Você só pode editar suas próprias mensagens" }, { status: 403 })
  }
  if (message.mediaUrl) {
    return NextResponse.json({ error: "Não é possível editar mensagem com anexo" }, { status: 400 })
  }

  const updated = await prisma.internalMessage.update({
    where: { id },
    data: { body: text.slice(0, 5000) },
  })

  const memberIds = (
    await prisma.internalConversationMember.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    })
  ).map((m) => m.userId)

  broadcastToUsers(memberIds, {
    type: "internal_message_update",
    data: { id: updated.id, conversationId: updated.conversationId, body: updated.body },
  })

  return NextResponse.json({ id: updated.id, body: updated.body })
}

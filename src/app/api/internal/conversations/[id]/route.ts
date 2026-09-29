import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"

// ─── DELETE /api/internal/conversations/[id] ──────────────────────────────────
// Exclui a conversa DE VERDADE, pra todo mundo, sem volta. Diferente de
// "apagar conversa" (clear/route.ts), que só esconde pra quem apagou até
// chegar mensagem nova — isso aqui apaga as mensagens do banco.
//
// Quem pode: qualquer membro da conversa (é uma ferramenta de limpar
// conversa própria/de teste/de engano, não uma moderação de admin sobre
// conversa alheia — cada um só apaga conversa da qual participa).
//
// onDelete: Cascade no schema cuida de members, messages e reactions.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const souMembro = await prisma.internalConversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: auth.id } },
    select: { id: true },
  })
  if (!souMembro) return NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 })

  // Pega os outros membros ANTES de apagar, pra avisar via SSE depois.
  const outros = await prisma.internalConversationMember.findMany({
    where: { conversationId: id, userId: { not: auth.id } },
    select: { userId: true },
  })

  await prisma.internalConversation.delete({ where: { id } })

  if (outros.length > 0) {
    broadcastToUsers(outros.map((o) => o.userId), {
      type: "internal_conversation_deleted",
      data: { conversationId: id, byName: auth.name },
    })
  }

  return NextResponse.json({ deleted: true })
}

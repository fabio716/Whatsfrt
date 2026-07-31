import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// POST /api/internal/conversations/[id]/read — marca a conversa como lida agora
// (atualiza lastReadAt do usuário). Usado quando chega mensagem via SSE com a
// conversa já aberta, pra não acumular "não lidas".
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const { id } = await params

  const updated = await prisma.internalConversationMember.updateMany({
    where: { conversationId: id, userId: me.id },
    data: { lastReadAt: new Date() },
  })
  if (updated.count === 0) {
    return NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 })
  }
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// ─── "Apagar conversa" no chat interno (igual WhatsApp, POR USUÁRIO) ─────────
// POST → esconde todo o histórico até agora SÓ pra quem chamou e tira a
// conversa da lista dele. Os outros membros não são afetados. Se alguém
// mandar mensagem nova, a conversa reabre mostrando só o que vier depois.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const updated = await prisma.internalConversationMember.updateMany({
    where: { conversationId: id, userId: auth.id },
    data: { clearedAt: new Date(), archivedAt: null },
  })
  if (updated.count === 0) return NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 })
  return NextResponse.json({ cleared: true })
}

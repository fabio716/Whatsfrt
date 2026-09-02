import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// ─── Arquivar conversa interna (igual WhatsApp, POR MEMBRO) ──────────────────
// POST → arquiva pra mim; DELETE → desarquiva. Mensagem nova posterior ao
// arquivamento faz a conversa reaparecer na lista automaticamente.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const updated = await prisma.internalConversationMember.updateMany({
    where: { conversationId: id, userId: auth.id },
    data: { archivedAt: new Date() },
  })
  if (updated.count === 0) return NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 })
  return NextResponse.json({ archived: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  await prisma.internalConversationMember.updateMany({
    where: { conversationId: id, userId: auth.id },
    data: { archivedAt: null },
  })
  return NextResponse.json({ archived: false })
}

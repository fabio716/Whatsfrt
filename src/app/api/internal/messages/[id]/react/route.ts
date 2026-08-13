import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

interface ReactBody {
  emoji: string | null // null/"" remove a reação
}

// PATCH /api/internal/messages/[id]/react — reage (ou remove reação) numa
// mensagem do chat interno, estilo WhatsApp. Qualquer membro da conversa pode
// reagir a qualquer mensagem (inclusive a própria). Uma reação por pessoa por
// mensagem — reagir de novo com outro emoji troca a anterior.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const { id } = await params

  let body: ReactBody
  try {
    body = (await request.json()) as ReactBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const emoji = body.emoji?.trim() || null

  const message = await prisma.internalMessage.findUnique({ where: { id }, select: { id: true, conversationId: true } })
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })

  const membership = await prisma.internalConversationMember.findUnique({
    where: { conversationId_userId: { conversationId: message.conversationId, userId: me.id } },
  })
  if (!membership) return NextResponse.json({ error: "Sem permissão para esta conversa" }, { status: 403 })

  if (emoji) {
    await prisma.internalMessageReaction.upsert({
      where: { messageId_userId: { messageId: id, userId: me.id } },
      create: { messageId: id, userId: me.id, emoji },
      update: { emoji },
    })
  } else {
    await prisma.internalMessageReaction.deleteMany({ where: { messageId: id, userId: me.id } })
  }

  const rows = await prisma.internalMessageReaction.findMany({
    where: { messageId: id },
    select: { userId: true, emoji: true },
  })
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const reactions = rows.map((r) => ({ userId: r.userId, userName: nameById.get(r.userId) ?? "?", emoji: r.emoji }))

  const memberIds = (
    await prisma.internalConversationMember.findMany({
      where: { conversationId: message.conversationId },
      select: { userId: true },
    })
  ).map((m) => m.userId)

  broadcastToUsers(memberIds, {
    type: "internal_reaction",
    data: { messageId: id, conversationId: message.conversationId, reactions },
  })

  return NextResponse.json({ reactions })
}

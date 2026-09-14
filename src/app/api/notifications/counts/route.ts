import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/notifications/counts → { internalUnread }
// Contagem de mensagens internas não lidas do usuário logado, pro badge que
// aparece no menu em QUALQUER tela do sistema (antes só a tela Mensagens
// sabia disso — quem estava em Chats/Contatos não era avisado).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const memberships = await prisma.internalConversationMember.findMany({
    where: { userId: auth.id },
    select: { conversationId: true, lastReadAt: true, clearedAt: true },
  })
  if (memberships.length === 0) return NextResponse.json({ internalUnread: 0 })

  const counts = await Promise.all(memberships.map(async (m) => {
    // Corte: o que foi lido e o que foi "apagado" pra este usuário.
    const cuts = [m.lastReadAt, m.clearedAt].filter((d): d is Date => Boolean(d))
    const since = cuts.length ? new Date(Math.max(...cuts.map((d) => d.getTime()))) : null
    return prisma.internalMessage.count({
      where: {
        conversationId: m.conversationId,
        senderId: { not: auth.id },
        ...(since ? { createdAt: { gt: since } } : {}),
      },
    })
  }))

  return NextResponse.json({ internalUnread: counts.reduce((a, b) => a + b, 0) })
}

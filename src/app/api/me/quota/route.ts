import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { getDailyMessageCount } from "@/lib/antispam"

// GET /api/me/quota — quota diaria de mensagens do agente logado.
// O painel de chat exibe "X / Y hoje" no header pro agente saber quanto
// pode mandar antes de bater no limite (HTTP 429 DAILY_LIMIT_REACHED).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { dailyMessageLimit: true },
  })
  const limit = user?.dailyMessageLimit ?? 150
  const sent = await getDailyMessageCount(session.id)

  return NextResponse.json({
    sent,
    limit,
    remaining: Math.max(0, limit - sent),
    // 1.0 = 100% usado. UI pode pintar amarelo/vermelho perto disso.
    ratio: limit > 0 ? Math.min(1, sent / limit) : 0,
  })
}

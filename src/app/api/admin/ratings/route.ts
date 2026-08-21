import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/admin/ratings?days=30
// Estatísticas de CSAT + ranking por agente + todas as notas/comentários dos
// clientes no período (não só as baixas — admin precisa ver o feedback
// completo, elogio incluso, não só reclamação).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const days = Math.min(365, Math.max(1, Number.parseInt(
    request.nextUrl.searchParams.get("days") ?? "30", 10,
  )))
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [allRated, byRating, byAgent, recentRatings, totalEnded] = await Promise.all([
    // Sessions com nota no período
    prisma.serviceSession.aggregate({
      where: { ratedAt: { gte: since, not: null }, rating: { not: null } },
      _avg: { rating: true },
      _count: { id: true },
    }),
    // Distribuição 1-5
    prisma.serviceSession.groupBy({
      by: ["rating"],
      where: { ratedAt: { gte: since, not: null }, rating: { not: null } },
      _count: { id: true },
    }),
    // Ranking por agente
    prisma.serviceSession.groupBy({
      by: ["agentId"],
      where: { ratedAt: { gte: since, not: null }, rating: { not: null } },
      _avg: { rating: true },
      _count: { id: true },
    }),
    // Todas as notas/comentários do período (não só as baixas) — teto de 300
    // pra não pesar a resposta; período longo com muito volume, filtra por
    // menos dias.
    prisma.serviceSession.findMany({
      where: { ratedAt: { gte: since, not: null }, rating: { not: null } },
      orderBy: { ratedAt: "desc" },
      take: 300,
      select: {
        id: true,
        rating: true,
        comment: true,
        ratedAt: true,
        startedAt: true,
        endedAt: true,
        agent: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    }),
    // Total de atendimentos encerrados no período (taxa de resposta)
    prisma.serviceSession.count({
      where: { endedAt: { gte: since, not: null } },
    }),
  ])

  const agents = await prisma.user.findMany({
    where: { id: { in: byAgent.map((g) => g.agentId) } },
    select: { id: true, name: true },
  })
  const agentName = new Map(agents.map((a) => [a.id, a.name]))

  const distribution = [1, 2, 3, 4, 5].map((star) => {
    const g = byRating.find((r) => r.rating === star)
    return { rating: star, count: g?._count.id ?? 0 }
  })

  const ranking = byAgent
    .map((g) => ({
      agentId: g.agentId,
      agentName: agentName.get(g.agentId) ?? "—",
      avgRating: g._avg.rating ?? 0,
      ratedCount: g._count.id,
    }))
    .sort((a, b) => b.avgRating - a.avgRating)

  const csat = allRated._avg.rating ?? null
  const promoters = byRating.filter((r) => r.rating !== null && r.rating >= 4)
    .reduce((acc, r) => acc + r._count.id, 0)
  const detractors = byRating.filter((r) => r.rating !== null && r.rating <= 2)
    .reduce((acc, r) => acc + r._count.id, 0)
  const ratedTotal = allRated._count.id

  return NextResponse.json({
    days,
    csat,
    ratedCount: ratedTotal,
    responseRate: totalEnded > 0 ? ratedTotal / totalEnded : null,
    distribution,
    promoters,
    detractors,
    ranking,
    recentRatings: recentRatings.map((s) => ({
      sessionId: s.id,
      rating: s.rating,
      comment: s.comment,
      ratedAt: s.ratedAt?.toISOString() ?? null,
      durationSec: s.endedAt
        ? Math.max(0, Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000))
        : 0,
      agentId: s.agent.id,
      agentName: s.agent.name,
      contactId: s.contact.id,
      contactName: s.contact.name,
    })),
  })
}

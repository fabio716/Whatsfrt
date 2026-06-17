import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/admin/team/live — snapshot do estado de cada agente ativo:
//   - contato em atendimento (se houver)
//   - tempo decorrido em atendimento
//   - tempo de espera do cliente até ser atendido
// + fila WAITING_AGENT (clientes esperando agente assumir)
// + histórico das últimas 24h
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [agents, queueContacts, recentSessions] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, role: "AGENT" },
      select: {
        id: true,
        name: true,
        department: true,
        assignedContacts: {
          where: { chatStatus: { in: ["IN_SERVICE", "AWAITING_RATING"] } },
          select: {
            id: true,
            name: true,
            whatsappId: true,
            chatStatus: true,
            inServiceSince: true,
            waitingAgentSince: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.contact.findMany({
      where: { chatStatus: "WAITING_AGENT", deletedAt: null },
      select: {
        id: true,
        name: true,
        whatsappId: true,
        waitingAgentSince: true,
      },
      orderBy: { waitingAgentSince: "asc" },
    }),
    prisma.serviceSession.findMany({
      where: { endedAt: { gte: yesterday, not: null } },
      orderBy: { endedAt: "desc" },
      take: 100,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        waitingFrom: true,
        rating: true,
        comment: true,
        autoEnded: true,
        agent: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, whatsappId: true } },
      },
    }),
  ])

  // Estatísticas das últimas 24h por agente (para mostrar na tabela)
  const statsRaw = await prisma.serviceSession.groupBy({
    by: ["agentId"],
    where: { endedAt: { gte: yesterday, not: null } },
    _count: { id: true },
    _avg: { rating: true },
  })
  const statsByAgent = new Map(
    statsRaw.map((s) => [s.agentId, {
      sessions: s._count.id,
      avgRating: s._avg.rating ?? null,
    }])
  )

  const team = agents.map((a) => {
    const current = a.assignedContacts[0] ?? null
    const stats = statsByAgent.get(a.id) ?? { sessions: 0, avgRating: null }
    return {
      agentId: a.id,
      agentName: a.name,
      department: a.department,
      current: current ? {
        contactId: current.id,
        contactName: current.name,
        whatsappId: current.whatsappId,
        chatStatus: current.chatStatus,
        inServiceSince: current.inServiceSince?.toISOString() ?? null,
        waitingAgentSince: current.waitingAgentSince?.toISOString() ?? null,
      } : null,
      sessionsToday: stats.sessions,
      avgRatingToday: stats.avgRating,
    }
  })

  const queue = queueContacts.map((c) => ({
    contactId: c.id,
    contactName: c.name,
    whatsappId: c.whatsappId,
    waitingSince: c.waitingAgentSince?.toISOString() ?? null,
  }))

  const history = recentSessions.map((s) => ({
    sessionId: s.id,
    agentId: s.agent.id,
    agentName: s.agent.name,
    contactId: s.contact.id,
    contactName: s.contact.name,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt!.toISOString(),
    waitedSec: Math.max(0, Math.round((s.startedAt.getTime() - s.waitingFrom.getTime()) / 1000)),
    durationSec: Math.max(0, Math.round((s.endedAt!.getTime() - s.startedAt.getTime()) / 1000)),
    rating: s.rating,
    comment: s.comment,
    autoEnded: s.autoEnded,
  }))

  return NextResponse.json({
    timestamp: now.toISOString(),
    team,
    queue,
    history,
  })
}

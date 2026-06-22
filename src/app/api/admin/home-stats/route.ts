import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { getOnlineUserIds } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/admin/home-stats — KPIs da home executiva.
//
// IMPORTANTE: esse endpoint roda a cada 30s pra CADA aba aberta. Tem que
// ser MUITO leve. Versao anterior fazia findMany de mensagens 24h e hoje,
// degradava todo o DB. Agora so usa COUNT e GROUP BY agregados no Postgres.
//
// avgResponseMin foi simplificado: usamos waiting time medio das
// ServiceSessions encerradas nas ultimas 24h (proxy razoavel pra "quanto
// tempo o cliente espera ate ser atendido"). Antes calculavamos a partir
// de TODAS as mensagens, o que era caro e nao escalava.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  // Tudo em paralelo, tudo agregado direto no Postgres.
  const [
    inServiceCount,
    waitingCount,
    csatAgg,
    waitingAgg,
    volumeRows,
    agents,
  ] = await Promise.all([
    prisma.contact.count({
      where: { chatStatus: "IN_SERVICE", deletedAt: null },
    }),
    prisma.contact.count({
      where: { chatStatus: "WAITING_AGENT", deletedAt: null },
    }),
    prisma.serviceSession.aggregate({
      where: { endedAt: { gte: yesterday, not: null }, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    // Tempo medio de espera ate o atendimento (proxy pra "resposta media").
    // Bem mais barato que walking todas as mensagens, e mais fiel ao SLA.
    prisma.$queryRaw<Array<{ avg_sec: number | null; count: bigint }>>`
      SELECT
        AVG(EXTRACT(EPOCH FROM ("startedAt" - "waitingFrom")))::DOUBLE PRECISION AS avg_sec,
        COUNT(*) AS count
      FROM service_sessions
      WHERE "endedAt" >= ${yesterday} AND "endedAt" IS NOT NULL
    `,
    // Volume por hora hoje, agregado direto no Postgres (24 linhas no max).
    prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT EXTRACT(HOUR FROM "createdAt")::INT AS hour, COUNT(*)::INT AS count
      FROM messages
      WHERE "createdAt" >= ${todayStart} AND direction = 'INBOUND'
      GROUP BY hour
      ORDER BY hour
    `,
    prisma.user.findMany({
      where: { isActive: true, role: "AGENT" },
      select: {
        id: true,
        name: true,
        assignedContacts: {
          where: { chatStatus: "IN_SERVICE", deletedAt: null },
          select: { id: true },
        },
      },
      orderBy: { name: "asc" },
    }),
  ])

  // Monta os 24 buckets a partir das linhas retornadas (nem toda hora tem dado).
  const volumeByHour = new Array<number>(24).fill(0)
  for (const row of volumeRows) {
    if (row.hour >= 0 && row.hour < 24) {
      volumeByHour[row.hour] = Number(row.count)
    }
  }

  const avgWaitSec = waitingAgg[0]?.avg_sec ?? null
  const avgResponseMin = avgWaitSec !== null ? +(avgWaitSec / 60).toFixed(1) : null

  const online = getOnlineUserIds()

  return NextResponse.json({
    timestamp: now.toISOString(),
    kpis: {
      inService: inServiceCount,
      waiting: waitingCount,
      csat: {
        avg: csatAgg._avg.rating !== null ? +csatAgg._avg.rating.toFixed(1) : null,
        count: csatAgg._count.rating,
      },
      avgResponseMin,
    },
    volumeByHour,
    agents: agents.map((a) => {
      const isOnline = online.has(a.id)
      const attending = a.assignedContacts.length
      let status: "ATTENDING" | "ONLINE" | "OFFLINE"
      if (attending > 0) status = "ATTENDING"
      else if (isOnline) status = "ONLINE"
      else status = "OFFLINE"
      return { id: a.id, name: a.name, status, attendingCount: attending }
    }),
  })
}

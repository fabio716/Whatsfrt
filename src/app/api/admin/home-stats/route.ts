import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { getOnlineUserIds } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/admin/home-stats — KPIs da home executiva.
//
// Foi feito enxuto de proposito: nao reusa /metrics (que carrega ALL contacts
// com messages, lento) nem /team/live (que devolve mais coisa do que precisa).
// Aqui só o que aparece no topo da home: 4 KPIs + volume por hora + lista
// curta de agentes online com ocupação atual.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const [
    inServiceCount,
    waitingCount,
    csatAgg,
    inboundToday,
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
    prisma.message.findMany({
      where: {
        direction: MessageDirection.INBOUND,
        createdAt: { gte: todayStart },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
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

  // Resposta média (últimas 24h): tempo entre inbound do cliente e
  // primeiro outbound do agente que o atende.
  const recentMessages = await prisma.message.findMany({
    where: { createdAt: { gte: yesterday } },
    select: { contactId: true, direction: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  const byContact = new Map<string, Array<{ d: MessageDirection; t: number }>>()
  for (const m of recentMessages) {
    const arr = byContact.get(m.contactId) ?? []
    arr.push({ d: m.direction, t: m.createdAt.getTime() })
    byContact.set(m.contactId, arr)
  }
  let respSum = 0
  let respCount = 0
  for (const msgs of byContact.values()) {
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].d === MessageDirection.INBOUND) {
        const nextOut = msgs.slice(i + 1).find((m) => m.d === MessageDirection.OUTBOUND)
        if (nextOut) {
          respSum += nextOut.t - msgs[i].t
          respCount += 1
        }
      }
    }
  }
  const avgResponseMin = respCount > 0
    ? +(respSum / respCount / 60_000).toFixed(1)
    : null

  // Volume hoje agrupado por hora (24 buckets, 0-23).
  const volumeByHour = new Array(24).fill(0) as number[]
  for (const m of inboundToday) {
    const h = m.createdAt.getHours()
    volumeByHour[h] += 1
  }

  // Presença real: derivada do Set de clientes SSE (quem tem aba aberta).
  // Sem isso, antes mostravamos todo agente cadastrado como "online" — ruim
  // pro admin que via "4 online" 3h da manha.
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

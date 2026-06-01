import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const contacts = await prisma.contact.findMany({
    where: { deletedAt: null },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      assignedUser: { select: { id: true, name: true } },
    },
  })

  const totalContacts = contacts.length
  const totalInService = contacts.filter(
    (c) => c.chatStatus === "IN_SERVICE" || c.chatStatus === "WAITING_AGENT"
  ).length

  // ── Calculate response times ──────────────────────────────────────────────
  type AgentStat = { name: string; totalMs: number; count: number }
  const agentMap = new Map<string, AgentStat>()

  let globalTotalMs = 0
  let globalCount = 0

  for (const contact of contacts) {
    const msgs = contact.messages
    const agentKey = contact.assignedUserId ?? "__unassigned__"
    const agentName = contact.assignedUser?.name ?? "Sem agente"

    if (!agentMap.has(agentKey)) {
      agentMap.set(agentKey, { name: agentName, totalMs: 0, count: 0 })
    }
    const stat = agentMap.get(agentKey)
    if (!stat) continue

    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].direction === "INBOUND") {
        const nextOut = msgs.slice(i + 1).find((m) => m.direction === "OUTBOUND")
        if (nextOut) {
          const ms = nextOut.createdAt.getTime() - msgs[i].createdAt.getTime()
          stat.totalMs += ms
          stat.count += 1
          globalTotalMs += ms
          globalCount += 1
        }
      }
    }
  }

  const avgResponseMs = globalCount > 0 ? Math.round(globalTotalMs / globalCount) : 0

  const byAgent = [...agentMap.entries()]
    .filter(([, s]) => s.count > 0)
    .map(([, s]) => ({
      name: s.name,
      avgMs: Math.round(s.totalMs / s.count),
      avgMin: +(s.totalMs / s.count / 60_000).toFixed(1),
      count: s.count,
    }))
    .sort((a, b) => a.avgMs - b.avgMs)

  return NextResponse.json({
    totalContacts,
    totalInService,
    avgResponseMs,
    avgResponseMin: +(avgResponseMs / 60_000).toFixed(1),
    globalCount,
    byAgent,
  })
}

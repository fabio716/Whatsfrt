import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"

async function requireAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = await verifySessionToken(token).catch(() => null)
  if (!session || session.role !== "ADMIN") return null
  return session
}

// ── GET /api/admin/campaigns — list with progress counts ──────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { logs: true } },
      logs: {
        where: { status: "SENT" },
        select: { id: true },
      },
    },
  })

  const result = campaigns.map((c: typeof campaigns[number]) => ({
    id: c.id,
    name: c.name,
    messageText: c.messageText,
    status: c.status,
    createdAt: c.createdAt,
    total: c._count.logs,
    sent: c.logs.length,
  }))

  return NextResponse.json(result)
}

// ── POST /api/admin/campaigns ───────────────────────────────────────────────
// Rota antiga: mandava pra todos os contatos, sem filtro nem limite. Desligada
// de vez — só a tela de Transmissão (/api/broadcast), que aplica os limites
// seguros contra bloqueio do WhatsApp (src/lib/bloqueioTransmissao.ts).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  return NextResponse.json({ error: "Envio para todos desativado. Use a tela de Transmissão." }, { status: 410 })
}

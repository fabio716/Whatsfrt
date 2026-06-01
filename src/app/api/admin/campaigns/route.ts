import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import { processCampaign } from "@/lib/campaignQueue"

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

// ── POST /api/admin/campaigns — create & fire ─────────────────────────────────

type AudienceFilter =
  | { type: "all" }
  | { type: "department"; value: string }
  | { type: "agent"; value: string }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(req)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const body = (await req.json()) as {
    name: string
    messageText: string
    filter: AudienceFilter
  }

  if (!body.name?.trim() || !body.messageText?.trim()) {
    return NextResponse.json({ error: "Nome e mensagem são obrigatórios" }, { status: 400 })
  }

  // ── Build contact query ───────────────────────────────────────────────────
  const baseWhere = { deletedAt: null }

  let contactWhere: Record<string, unknown> = baseWhere
  if (body.filter.type === "department") {
    contactWhere = {
      ...baseWhere,
      assignedUser: { department: body.filter.value },
    }
  } else if (body.filter.type === "agent") {
    contactWhere = { ...baseWhere, assignedUserId: body.filter.value }
  }

  const contacts = await prisma.contact.findMany({
    where: contactWhere,
    select: { id: true },
  })

  if (contacts.length === 0) {
    return NextResponse.json({ error: "Nenhum contato encontrado para o filtro selecionado" }, { status: 400 })
  }

  // ── Create campaign + logs ────────────────────────────────────────────────
  const campaign = await prisma.campaign.create({
    data: {
      name: body.name.trim(),
      messageText: body.messageText.trim(),
      status: "PENDING",
      logs: {
        createMany: {
          data: contacts.map((c) => ({ contactId: c.id, status: "PENDING" })),
        },
      },
    },
    select: { id: true, name: true, status: true, createdAt: true },
  })

  // ── Fire-and-forget (no await) ────────────────────────────────────────────
  processCampaign(campaign.id).catch((e: unknown) => console.error("[campaign fire]", e))

  return NextResponse.json({ ...campaign, total: contacts.length, sent: 0 }, { status: 201 })
}

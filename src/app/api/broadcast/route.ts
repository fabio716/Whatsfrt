import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionFromRequest } from "@/lib/auth"
import { processCampaign } from "@/lib/campaignQueue"

// ── GET /api/broadcast — list broadcasts (agents see only their own) ──────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const isAgent = session.role === "AGENT"

  const campaigns = await prisma.campaign.findMany({
    where: isAgent ? { createdById: session.id } : {},
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { logs: true } },
      logs: { where: { status: "SENT" }, select: { id: true } },
    },
  })

  const result = campaigns.map((c) => ({
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

// ── POST /api/broadcast — create & fire ───────────────────────────────────────
type AudienceFilter =
  | { type: "all" }
  | { type: "cooperative"; value: string }
  | { type: "agent"; value: string }
  | { type: "manual"; contactIds: string[] }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const isAgent = session.role === "AGENT"

  let body: { name?: string; messageText?: string; filter?: AudienceFilter }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const { name, messageText, filter } = body
  if (!name?.trim() || !messageText?.trim() || !filter) {
    return NextResponse.json({ error: "Nome, mensagem e filtro são obrigatórios" }, { status: 400 })
  }

  // ── Build contact query (agents are always scoped to their own contacts) ────
  const baseWhere: Record<string, unknown> = {
    deletedAt: null,
    whatsappId: { not: { contains: "@lid" } },
    ...(isAgent ? { assignedUserId: session.id } : {}),
  }

  let contactWhere: Record<string, unknown> = baseWhere
  if (filter.type === "cooperative") {
    contactWhere = { ...baseWhere, cooperativeId: filter.value }
  } else if (filter.type === "agent") {
    // Only admins may target an arbitrary agent's contacts.
    if (isAgent) return NextResponse.json({ error: "Sem permissão para este filtro" }, { status: 403 })
    contactWhere = { ...baseWhere, assignedUserId: filter.value }
  } else if (filter.type === "manual") {
    if (!Array.isArray(filter.contactIds) || filter.contactIds.length === 0) {
      return NextResponse.json({ error: "Selecione ao menos um contato" }, { status: 400 })
    }
    // The base scope guarantees agents can only ever target their own contacts,
    // so any non-owned ids in the list are silently excluded.
    contactWhere = { ...baseWhere, id: { in: filter.contactIds } }
  }

  const contacts = await prisma.contact.findMany({
    where: contactWhere,
    select: { id: true },
  })

  if (contacts.length === 0) {
    return NextResponse.json({ error: "Nenhum contato encontrado para o filtro selecionado" }, { status: 400 })
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: name.trim(),
      messageText: messageText.trim(),
      status: "PENDING",
      createdById: session.id,
      logs: {
        createMany: { data: contacts.map((c) => ({ contactId: c.id, status: "PENDING" })) },
      },
    },
    select: { id: true, name: true, status: true, createdAt: true },
  })

  // Fire-and-forget
  processCampaign(campaign.id).catch((e: unknown) => console.error("[broadcast fire]", e))

  return NextResponse.json({ ...campaign, total: contacts.length, sent: 0 }, { status: 201 })
}

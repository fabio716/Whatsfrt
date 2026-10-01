import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionFromRequest } from "@/lib/auth"
import { processCampaign } from "@/lib/campaignQueue"
import { carteiraDoAgente, chaveEmpresa } from "@/lib/broadcastScope"
import type { Prisma } from "@/generated/prisma/client"

// ── GET /api/broadcast — list broadcasts (agents see only their own) ──────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const isAgent = session.role === "AGENT"

  const campaigns = await prisma.campaign.findMany({
    where: isAgent ? { createdById: session.id } : {},
    orderBy: { createdAt: "desc" },
  })

  const ids = campaigns.map((c) => c.id)
  const grouped = ids.length
    ? await prisma.campaignLog.groupBy({
        by: ["campaignId", "status"],
        where: { campaignId: { in: ids } },
        _count: { _all: true },
      })
    : []

  const countsByCampaign = new Map<string, Record<string, number>>()
  for (const g of grouped) {
    const entry = countsByCampaign.get(g.campaignId) ?? {}
    entry[g.status] = g._count._all
    countsByCampaign.set(g.campaignId, entry)
  }

  const result = campaigns.map((c) => {
    const k = countsByCampaign.get(c.id) ?? {}
    const pending = k.PENDING ?? 0
    const failed = k.FAILED ?? 0
    const readCount = k.READ ?? 0
    const deliveredCount = (k.DELIVERED ?? 0) + readCount
    const sentCount = (k.SENT ?? 0) + deliveredCount
    const total = pending + failed + sentCount
    return {
      id: c.id,
      name: c.name,
      messageText: c.messageText,
      mediaUrl: c.mediaUrl,
      mediaType: c.mediaType,
      status: c.status,
      createdAt: c.createdAt,
      total,
      sent: sentCount,
      delivered: deliveredCount,
      read: readCount,
      failed,
    }
  })

  return NextResponse.json(result)
}

// ── POST /api/broadcast — create & fire ───────────────────────────────────────
type AudienceFilter =
  | { type: "all" }
  | { type: "cooperative"; value: string }
  // Várias empresas (chaveEmpresa() do campo Empresa) e/ou cooperativas de
  // uma vez — recebe quem estiver em qualquer uma delas.
  | { type: "grupos"; empresas?: string[]; cooperativas?: string[] }
  | { type: "agent"; value: string }
  | { type: "manual"; contactIds: string[] }

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const isAgent = session.role === "AGENT"

  let body: { name?: string; messageText?: string; filter?: AudienceFilter; mediaUrl?: string; mediaType?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const { name, messageText, filter, mediaUrl, mediaType } = body
  const hasMedia = Boolean(mediaUrl && mediaType)
  if (!name?.trim() || !filter || (!messageText?.trim() && !hasMedia)) {
    return NextResponse.json({ error: "Nome, destinatários e mensagem (ou imagem) são obrigatórios" }, { status: 400 })
  }

  // ── Build contact query (agents are always scoped to their own contacts) ────
  const baseWhere: Prisma.ContactWhereInput = {
    deletedAt: null,
    whatsappId: { not: { contains: "@lid" } },
    ...(isAgent ? carteiraDoAgente(session.id) : {}),
  }

  let contactWhere: Prisma.ContactWhereInput = baseWhere
  if (filter.type === "cooperative") {
    contactWhere = { ...baseWhere, cooperativeId: filter.value }
  } else if (filter.type === "grupos") {
    // Empresa é texto digitado à mão (espaços, maiúsculas variam) — compara
    // pela mesma chave normalizada que a tela usou pra montar a lista.
    const empresas = new Set((Array.isArray(filter.empresas) ? filter.empresas : []).map(chaveEmpresa).filter(Boolean))
    const cooperativas = (Array.isArray(filter.cooperativas) ? filter.cooperativas : []).filter((id) => typeof id === "string" && id)
    if (empresas.size === 0 && cooperativas.length === 0) {
      return NextResponse.json({ error: "Marque ao menos uma empresa ou cooperativa" }, { status: 400 })
    }
    const candidatos = await prisma.contact.findMany({
      where: {
        AND: [
          baseWhere,
          { OR: [{ empresa: { not: null } }, ...(cooperativas.length ? [{ cooperativeId: { in: cooperativas } }] : [])] },
        ],
      },
      select: { id: true, empresa: true, cooperativeId: true },
    })
    const ids = candidatos
      .filter((c) => empresas.has(chaveEmpresa(c.empresa)) || (c.cooperativeId !== null && cooperativas.includes(c.cooperativeId)))
      .map((c) => c.id)
    contactWhere = { ...baseWhere, id: { in: ids } }
  } else if (filter.type === "agent") {
    // Only admins may target an arbitrary agent's contacts.
    if (isAgent) return NextResponse.json({ error: "Sem permissão para este filtro" }, { status: 403 })
    contactWhere = { ...baseWhere, ...carteiraDoAgente(filter.value) }
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
      messageText: messageText?.trim() ?? "",
      mediaUrl: hasMedia ? mediaUrl : null,
      mediaType: hasMedia ? mediaType : null,
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

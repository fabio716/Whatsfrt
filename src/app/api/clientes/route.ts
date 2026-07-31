import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/clientes?q=joao&campo=nome&page=1
//
// Lista contatos cadastrados com busca opcional por:
//   - nome (q em "name" — busca starts-with insensível a case, suficiente p/ 3 letras)
//   - empresa
//   - cidade
//   - telefone (q em "whatsappId" — busca contains)
//
// Filtro de visibilidade:
//   - AGENT: só contatos atribuídos a ele (isolamento)
//   - ADMIN: todos
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const url = request.nextUrl
  const q = (url.searchParams.get("q") ?? "").trim()
  const campo = url.searchParams.get("campo") ?? "nome"
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1)
  const PAGE = 50

  // Pool aberto: todos os usuários veem todos os clientes (sem filtro por
  // carteira). `session` mantido pra exigir autenticação.
  void session
  const where: Record<string, unknown> = {
    deletedAt: null,
  }

  if (q.length > 0) {
    if (campo === "empresa") {
      where.empresa = { contains: q, mode: "insensitive" }
    } else if (campo === "cidade") {
      where.cidade = { contains: q, mode: "insensitive" }
    } else if (campo === "telefone") {
      const digits = q.replace(/\D/g, "")
      if (digits.length > 0) where.whatsappId = { contains: digits }
    } else {
      // nome (default) — busca por início de palavra ou começo do nome (3+ letras suficiente)
      where.name = { contains: q, mode: "insensitive" }
    }
  }

  const [items, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      orderBy: { name: "asc" },
      take: PAGE,
      skip: (page - 1) * PAGE,
      select: {
        id: true,
        whatsappId: true,
        name: true,
        empresa: true,
        cidade: true,
        chatStatus: true,
        assignedUserId: true,
        updatedAt: true,
      },
    }),
    prisma.contact.count({ where }),
  ])

  return NextResponse.json({
    items,
    total,
    page,
    pageSize: PAGE,
    hasMore: total > page * PAGE,
  })
}

// PATCH /api/clientes/:id — atualiza empresa/cidade do contato.
// Pool aberto: qualquer usuário autenticado pode atualizar.
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let body: { id?: string; empresa?: string | null; cidade?: string | null }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 })

  const contact = await prisma.contact.findUnique({
    where: { id: body.id },
    select: { id: true },
  })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  // Pool aberto: qualquer usuário autenticado pode atualizar dados do cliente.

  const data: Record<string, unknown> = {}
  if ("empresa" in body) data.empresa = body.empresa?.trim() || null
  if ("cidade" in body) data.cidade = body.cidade?.trim() || null

  const updated = await prisma.contact.update({
    where: { id: body.id },
    data,
    select: { id: true, empresa: true, cidade: true },
  })

  return NextResponse.json(updated)
}

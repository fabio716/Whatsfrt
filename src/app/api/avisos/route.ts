import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { avisarNovoAviso } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// GET: ?pendentes=1 → meus avisos ainda sem ciência (alvo da janela na tela);
//      ?todos=1 (admin) → todos os avisos com o status de cada pessoa;
//      sem parâmetro → os meus avisos (histórico).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const q = request.nextUrl.searchParams
  const todos = auth.role === "ADMIN" && q.get("todos") === "1"
  const pendentes = q.get("pendentes") === "1"
  const avisos = await prisma.aviso.findMany({
    where: todos ? {} : { destinatarios: { some: { userId: auth.id, ...(pendentes ? { cienteAt: null } : {}) } } },
    include: { destinatarios: true }, orderBy: { createdAt: "desc" }, take: 100,
  })
  const ids = [...new Set(avisos.flatMap((a) => [a.criadoPorId, ...a.destinatarios.map((d) => d.userId)]))]
  const nomes = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  return NextResponse.json({
    avisos: avisos.map((a) => ({
      id: a.id, titulo: a.titulo, texto: a.texto, criadoEm: a.createdAt.toISOString(), deNome: nomes.get(a.criadoPorId) ?? "—",
      minhaCiencia: a.destinatarios.find((d) => d.userId === auth.id)?.cienteAt?.toISOString() ?? null,
      destinatarios: todos ? a.destinatarios.map((d) => ({ id: d.userId, nome: nomes.get(d.userId) ?? "—", cienteAt: d.cienteAt?.toISOString() ?? null })) : undefined,
    })),
  })
}

// Só o administrador cria. Escolhe uma ou várias pessoas (ou todas).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  if (auth.role !== "ADMIN") return NextResponse.json({ erro: "Só o administrador cria avisos." }, { status: 403 })
  const c = (await request.json().catch(() => null)) as { titulo?: unknown; texto?: unknown; userIds?: unknown; todos?: unknown } | null
  const titulo = typeof c?.titulo === "string" ? c.titulo.trim() : ""
  const texto = typeof c?.texto === "string" ? c.texto.trim() : ""
  if (titulo.length < 3 || titulo.length > 120) return NextResponse.json({ erro: "Escreva o título do aviso (3 a 120 caracteres)." }, { status: 400 })
  if (texto.length < 3 || texto.length > 1500) return NextResponse.json({ erro: "Escreva o texto do aviso (até 1500 caracteres)." }, { status: 400 })
  const pedidos = Array.isArray(c?.userIds) ? c.userIds.filter((x): x is string => typeof x === "string").slice(0, 300) : []
  const pessoas = await prisma.user.findMany({
    where: { isActive: true, id: c?.todos === true ? { not: auth.id } : { in: pedidos } }, select: { id: true },
  })
  if (pessoas.length === 0) return NextResponse.json({ erro: "Escolha pelo menos uma pessoa para receber o aviso." }, { status: 400 })
  const aviso = await prisma.aviso.create({
    data: { titulo, texto, criadoPorId: auth.id, destinatarios: { create: pessoas.map((p) => ({ userId: p.id })) } },
  })
  await avisarNovoAviso(pessoas.map((p) => p.id), aviso.id, titulo, auth.name)
  return NextResponse.json({ ok: true, id: aviso.id, destinatarios: pessoas.length })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { avisarNovaTarefa } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// Lista: o administrador vê todas (?todas=1); cada pessoa vê as suas.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const todas = auth.role === "ADMIN" && request.nextUrl.searchParams.get("todas") === "1"
  // ?aresponder=1: só as minhas que ainda esperam eu aceitar o prazo ou propor outro.
  const aResponder = request.nextUrl.searchParams.get("aresponder") === "1"
  const tarefas = await prisma.tarefa.findMany({
    where: aResponder ? { paraUserId: auth.id, concluidaAt: null, cienteAt: null, propostaStatus: null } : todas ? {} : { paraUserId: auth.id },
    orderBy: [{ concluidaAt: { sort: "asc", nulls: "first" } }, { prazoEm: "asc" }], take: 300,
  })
  const ids = [...new Set(tarefas.flatMap((t) => [t.paraUserId, t.criadaPorId, ...(t.recebidaPorId ? [t.recebidaPorId] : [])]))]
  const nomes = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  return NextResponse.json({
    tarefas: tarefas.map((t) => ({
      id: t.id, titulo: t.titulo, detalhes: t.detalhes, prazoEm: t.prazoEm.toISOString(),
      cienteAt: t.cienteAt?.toISOString() ?? null, concluidaAt: t.concluidaAt?.toISOString() ?? null,
      feedback: t.feedback, prazoProposto: t.prazoProposto?.toISOString() ?? null, justificativa: t.justificativa,
      propostaStatus: t.propostaStatus, notaDecisao: t.notaDecisao,
      recebidaEm: t.recebidaEm?.toISOString() ?? null, recebidaPorNome: t.recebidaPorId ? nomes.get(t.recebidaPorId) ?? null : null, notaRecebimento: t.notaRecebimento, criadaEm: t.createdAt.toISOString(),
      paraId: t.paraUserId, paraNome: nomes.get(t.paraUserId) ?? "—", deNome: nomes.get(t.criadaPorId) ?? "—",
      atrasada: !t.concluidaAt && t.prazoEm.getTime() < Date.now(),
    })),
  })
}

// Só o administrador cria. Prazo (data e hora) é obrigatório.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  if (auth.role !== "ADMIN") return NextResponse.json({ erro: "Só o administrador cria tarefas." }, { status: 403 })
  const c = (await request.json().catch(() => null)) as { titulo?: unknown; detalhes?: unknown; paraUserId?: unknown; prazoEm?: unknown } | null
  const titulo = typeof c?.titulo === "string" ? c.titulo.trim() : ""
  const detalhes = typeof c?.detalhes === "string" ? c.detalhes.trim().slice(0, 1000) : ""
  const paraUserId = typeof c?.paraUserId === "string" ? c.paraUserId : ""
  const prazo = typeof c?.prazoEm === "string" ? new Date(c.prazoEm) : null
  if (titulo.length < 3 || titulo.length > 120) return NextResponse.json({ erro: "Escreva o título da tarefa (3 a 120 caracteres)." }, { status: 400 })
  if (!prazo || Number.isNaN(prazo.getTime())) return NextResponse.json({ erro: "Informe o prazo (data e hora)." }, { status: 400 })
  if (prazo.getTime() < Date.now() - 60_000) return NextResponse.json({ erro: "O prazo precisa ser no futuro." }, { status: 400 })
  const pessoa = await prisma.user.findFirst({ where: { id: paraUserId, isActive: true }, select: { id: true } })
  if (!pessoa) return NextResponse.json({ erro: "Escolha a pessoa responsável." }, { status: 400 })
  const t = await prisma.tarefa.create({ data: { titulo, detalhes: detalhes || null, criadaPorId: auth.id, paraUserId, prazoEm: prazo } })
  await avisarNovaTarefa(paraUserId, titulo, prazo, auth.name)
  return NextResponse.json({ ok: true, id: t.id })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { avisarPropostaDePrazo } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// A pessoa responsável dá o "ciente" ou conclui. CONCLUIR exige feedback escrito.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const c = (await request.json().catch(() => null)) as { acao?: unknown; feedback?: unknown; prazoProposto?: unknown; justificativa?: unknown } | null
  const t = await prisma.tarefa.findUnique({ where: { id } })
  if (!t || t.paraUserId !== auth.id) return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 })
  if (t.concluidaAt) return NextResponse.json({ erro: "Esta tarefa já foi concluída." }, { status: 409 })
  if (c?.acao === "ciente") {
    await prisma.tarefa.updateMany({ where: { id, cienteAt: null }, data: { cienteAt: new Date() } })
    return NextResponse.json({ ok: true })
  }
  if (c?.acao === "propor") {
    if (t.propostaStatus) return NextResponse.json({ erro: "Você já pediu outro prazo para esta tarefa." }, { status: 409 })
    const proposto = typeof c.prazoProposto === "string" ? new Date(c.prazoProposto) : null
    const just = typeof c.justificativa === "string" ? c.justificativa.trim() : ""
    if (!proposto || Number.isNaN(proposto.getTime())) return NextResponse.json({ erro: "Informe o novo prazo (data e hora)." }, { status: 400 })
    if (proposto.getTime() <= Math.max(t.prazoEm.getTime(), Date.now())) return NextResponse.json({ erro: "O novo prazo precisa ser depois do prazo atual." }, { status: 400 })
    if (proposto.getTime() > Date.now() + 60 * 86_400_000) return NextResponse.json({ erro: "O novo prazo pode ser de até 60 dias." }, { status: 400 })
    if (just.length < 10) return NextResponse.json({ erro: "Explique o motivo do novo prazo (mínimo 10 caracteres)." }, { status: 400 })
    const agora = new Date()
    const m = await prisma.tarefa.updateMany({
      where: { id, propostaStatus: null, concluidaAt: null },
      data: { prazoProposto: proposto, justificativa: just.slice(0, 300), propostaEm: agora, propostaStatus: "PENDENTE", cienteAt: t.cienteAt ?? agora },
    })
    if (m.count === 0) return NextResponse.json({ erro: "Não foi possível registrar o pedido." }, { status: 409 })
    await avisarPropostaDePrazo(id, auth.name, t.titulo, t.prazoEm, proposto, just.slice(0, 300))
    return NextResponse.json({ ok: true })
  }
  if (c?.acao === "concluir") {
    const feedback = typeof c.feedback === "string" ? c.feedback.trim() : ""
    if (feedback.length < 10) return NextResponse.json({ erro: "Para concluir, escreva o feedback: o que foi feito e o resultado (mínimo 10 caracteres)." }, { status: 400 })
    const agora = new Date()
    await prisma.tarefa.updateMany({ where: { id, concluidaAt: null }, data: { concluidaAt: agora, feedback: feedback.slice(0, 1000), cienteAt: t.cienteAt ?? agora } })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 })
}

// Administrador cancela (apaga) uma tarefa.
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  if (auth.role !== "ADMIN") return NextResponse.json({ erro: "Só o administrador cancela tarefas." }, { status: 403 })
  const { id } = await ctx.params
  await prisma.tarefa.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}

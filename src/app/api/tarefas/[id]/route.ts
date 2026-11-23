import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// A pessoa responsável dá o "ciente" ou conclui. CONCLUIR exige feedback escrito.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const c = (await request.json().catch(() => null)) as { acao?: unknown; feedback?: unknown } | null
  const t = await prisma.tarefa.findUnique({ where: { id } })
  if (!t || t.paraUserId !== auth.id) return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 })
  if (t.concluidaAt) return NextResponse.json({ erro: "Esta tarefa já foi concluída." }, { status: 409 })
  if (c?.acao === "ciente") {
    await prisma.tarefa.updateMany({ where: { id, cienteAt: null }, data: { cienteAt: new Date() } })
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

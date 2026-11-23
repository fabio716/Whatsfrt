import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { avisarDecisaoDePrazo } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// Administrador decide o pedido de novo prazo: aprova (o prazo muda) ou mantém o original.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const c = (await request.json().catch(() => null)) as { aprovar?: unknown; nota?: unknown } | null
  if (typeof c?.aprovar !== "boolean") return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 })
  const nota = typeof c.nota === "string" ? c.nota.trim().slice(0, 200) : ""
  const t = await prisma.tarefa.findUnique({ where: { id } })
  if (!t || t.concluidaAt || t.propostaStatus !== "PENDENTE" || !t.prazoProposto) return NextResponse.json({ erro: "Não há pedido de prazo pendente nesta tarefa." }, { status: 409 })
  const agora = new Date()
  const prazo = c.aprovar ? t.prazoProposto : t.prazoEm
  const m = await prisma.tarefa.updateMany({
    where: { id, propostaStatus: "PENDENTE" },
    data: { propostaStatus: c.aprovar ? "APROVADA" : "RECUSADA", decididaEm: agora, notaDecisao: nota || null, prazoEm: prazo, avisadaAt: null, escaladaEm: null },
  })
  if (m.count === 0) return NextResponse.json({ erro: "Este pedido já foi decidido." }, { status: 409 })
  await avisarDecisaoDePrazo(t.paraUserId, t.titulo, c.aprovar, prazo, nota || null)
  return NextResponse.json({ ok: true })
}

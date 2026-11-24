import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { avisarRecebimento } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// Administrador confirma que RECEBEU o feedback; a pessoa é avisada e vê "Recebido".
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const c = (await request.json().catch(() => null)) as { nota?: unknown } | null
  const nota = typeof c?.nota === "string" ? c.nota.trim().slice(0, 200) : ""
  const t = await prisma.tarefa.findUnique({ where: { id } })
  if (!t || !t.concluidaAt) return NextResponse.json({ erro: "Esta tarefa ainda não foi concluída." }, { status: 409 })
  const m = await prisma.tarefa.updateMany({ where: { id, recebidaEm: null }, data: { recebidaEm: new Date(), recebidaPorId: auth.id, notaRecebimento: nota || null } })
  if (m.count === 0) return NextResponse.json({ erro: "O recebimento já foi confirmado." }, { status: 409 })
  await avisarRecebimento(t.paraUserId, id, auth.name, t.titulo, nota || null)
  return NextResponse.json({ ok: true })
}

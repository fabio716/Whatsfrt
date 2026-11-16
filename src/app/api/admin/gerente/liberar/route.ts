import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Administrador libera uma ocorrência em aberto (ex.: o cliente foi atendido
// fora do sistema). Fecha o caso e destrava a tela da pessoa.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const corpo = (await request.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof corpo?.id === "string" ? corpo.id : ""
  if (!id) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 })
  const o = await prisma.gerenteOcorrencia.findUnique({ where: { id }, select: { desde: true, resolvidaEm: true } })
  if (!o || o.resolvidaEm) return NextResponse.json({ erro: "Esta ocorrência já está fechada." }, { status: 409 })
  const agora = new Date()
  await prisma.gerenteOcorrencia.updateMany({
    where: { id, resolvidaEm: null },
    data: { resolvidaEm: agora, resolvidaPorId: auth.id, esperaMin: Math.max(0, Math.round((agora.getTime() - o.desde.getTime()) / 60_000)) },
  })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { redis } from "@/lib/redis"
import { avisarNovoAviso } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// Reenvia o aviso (push + chat) só para quem ainda não deu ciência. No máximo
// um lembrete a cada 10 minutos por aviso, para não virar incômodo.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const aviso = await prisma.aviso.findUnique({ where: { id }, include: { destinatarios: { where: { cienteAt: null } } } })
  if (!aviso) return NextResponse.json({ erro: "Aviso não encontrado." }, { status: 404 })
  if (aviso.destinatarios.length === 0) return NextResponse.json({ erro: "Todos já deram ciência." }, { status: 409 })
  const chave = `aviso:lembrar:${id}`
  if ((await redis.incr(chave)) !== 1) return NextResponse.json({ erro: "Um lembrete já foi enviado há pouco. Aguarde 10 minutos." }, { status: 429 })
  await redis.expire(chave, 600)
  await avisarNovoAviso(aviso.destinatarios.map((d) => d.userId), id, aviso.titulo, auth.name, true)
  return NextResponse.json({ ok: true, lembrados: aviso.destinatarios.length })
}

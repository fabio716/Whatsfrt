import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// "Ciente" do aviso: grava quem e quando. Só vale para quem foi escolhido.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const d = await prisma.avisoDestinatario.findUnique({ where: { avisoId_userId: { avisoId: id, userId: auth.id } }, select: { cienteAt: true } })
  if (!d) return NextResponse.json({ erro: "Aviso não encontrado." }, { status: 404 })
  if (!d.cienteAt) await prisma.avisoDestinatario.updateMany({ where: { avisoId: id, userId: auth.id, cienteAt: null }, data: { cienteAt: new Date() } })
  return NextResponse.json({ ok: true })
}

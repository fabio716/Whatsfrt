import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Administrador apaga um aviso (some da tela de quem ainda não deu ciência).
export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  await prisma.aviso.deleteMany({ where: { id } })
  return NextResponse.json({ ok: true })
}

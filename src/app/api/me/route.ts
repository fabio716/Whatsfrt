import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/me — dados do usuário logado (pra tela "Meu perfil").
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: { id: true, name: true, email: true, role: true, department: true, photoUrl: true },
  })
  if (!user) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })
  return NextResponse.json(user)
}

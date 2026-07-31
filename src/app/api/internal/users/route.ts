import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// GET /api/internal/users — lista os colegas (usuários ativos, exceto eu mesmo)
// disponíveis para iniciar uma conversa interna. Aberto a qualquer autenticado.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const users = await prisma.user.findMany({
    where: { isActive: true, id: { not: session.id } },
    select: { id: true, name: true, role: true, department: true },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(users)
}

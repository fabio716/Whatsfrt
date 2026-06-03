import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// GET - Lista territórios
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    const territories = await prisma.territory.findMany({
      orderBy: { uf: "asc" },
    })

    // Busca nomes dos usuários
    const territoriesWithUsers = await Promise.all(
      territories.map(async (t) => {
        const users = await prisma.user.findMany({
          where: { id: { in: t.assignedUserIds } },
          select: { id: true, name: true, email: true },
        })
        return { ...t, assignedUsers: users }
      })
    )

    return NextResponse.json(territoriesWithUsers)
  } catch (err) {
    console.error("[Territories] Error:", err)
    return NextResponse.json({ error: "Erro ao buscar territórios" }, { status: 500 })
  }
}

// POST - Cria território
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    const body = await request.json()
    const { uf, assignedUserIds } = body

    if (!uf) {
      return NextResponse.json({ error: "UF é obrigatória" }, { status: 400 })
    }

    const territory = await prisma.territory.create({
      data: {
        uf: uf.toUpperCase(),
        assignedUserIds: assignedUserIds || [],
        isActive: true,
      },
    })

    return NextResponse.json(territory, { status: 201 })
  } catch (err) {
    console.error("[Territories] Error creating:", err)
    return NextResponse.json({ error: "Erro ao criar território" }, { status: 500 })
  }
}

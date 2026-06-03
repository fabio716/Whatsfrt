import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// GET - Lista cooperativas
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    const cooperatives = await prisma.cooperative.findMany({
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json(cooperatives)
  } catch (err) {
    console.error("[Cooperatives] Error:", err)
    return NextResponse.json({ error: "Erro ao buscar cooperativas" }, { status: 500 })
  }
}

// POST - Cria cooperativa
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    const body = await request.json()
    const { name, cnpjBase, assignedUserId } = body

    if (!name) {
      return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
    }

    const cooperative = await prisma.cooperative.create({
      data: {
        name,
        cnpjBase: cnpjBase || null,
        assignedUserId: assignedUserId || null,
        isActive: true,
      },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(cooperative, { status: 201 })
  } catch (err) {
    console.error("[Cooperatives] Error creating:", err)
    return NextResponse.json({ error: "Erro ao criar cooperativa" }, { status: 500 })
  }
}

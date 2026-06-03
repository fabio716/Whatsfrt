import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// PUT - Atualiza cooperativa
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { id } = await params

  try {
    const body = await request.json()
    const { name, cnpjBase, assignedUserId, isActive } = body

    const cooperative = await prisma.cooperative.update({
      where: { id },
      data: {
        name,
        cnpjBase,
        assignedUserId,
        isActive,
      },
      include: {
        assignedUser: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(cooperative)
  } catch (err) {
    console.error("[Cooperatives] Error updating:", err)
    return NextResponse.json({ error: "Erro ao atualizar cooperativa" }, { status: 500 })
  }
}

// DELETE - Deleta cooperativa
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { id } = await params

  try {
    await prisma.cooperative.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[Cooperatives] Error deleting:", err)
    return NextResponse.json({ error: "Erro ao deletar cooperativa" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// PUT - Atualiza território
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    const body = await request.json()
    const { uf, assignedUserIds, isActive } = body

    const territory = await prisma.territory.update({
      where: { id: params.id },
      data: {
        uf: uf?.toUpperCase(),
        assignedUserIds,
        isActive,
      },
    })

    return NextResponse.json(territory)
  } catch (err) {
    console.error("[Territories] Error updating:", err)
    return NextResponse.json({ error: "Erro ao atualizar território" }, { status: 500 })
  }
}

// DELETE - Deleta território
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    await prisma.territory.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[Territories] Error deleting:", err)
    return NextResponse.json({ error: "Erro ao deletar território" }, { status: 500 })
  }
}

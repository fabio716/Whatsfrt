import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const contacts = await prisma.contact.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      whatsappId: true,
      chatStatus: true,
      createdAt: true,
      assignedUser: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(contacts)
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"
import { invalidateUraCache } from "@/lib/ura"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { id } = await params
  const body = (await request.json()) as {
    digit?: string
    label?: string
    targetDepartment?: string
    order?: number
  }

  const data: Record<string, unknown> = {}
  if (body.digit            !== undefined) data.digit            = body.digit
  if (body.label            !== undefined) data.label            = body.label
  if (body.targetDepartment !== undefined) data.targetDepartment = body.targetDepartment
  if (body.order            !== undefined) data.order            = body.order

  const option = await prisma.uraMenuOption.update({ where: { id }, data })

  invalidateUraCache()
  return NextResponse.json(option)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { id } = await params
  await prisma.uraMenuOption.delete({ where: { id } })
  invalidateUraCache()
  return new NextResponse(null, { status: 204 })
}

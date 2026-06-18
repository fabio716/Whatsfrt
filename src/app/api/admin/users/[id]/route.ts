import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { requireAdmin } from "@/app/api/admin/users/route"

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { id } = await params
  const body = (await request.json()) as {
    name?: string
    email?: string
    password?: string
    department?: string | null
    role?: string
    dailyMessageLimit?: number
  }

  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  if (body.email && body.email !== existing.email) {
    const conflict = await prisma.user.findFirst({ where: { email: body.email.toLowerCase().trim(), id: { not: id } } })
    if (conflict) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 })
  }

  const data: Record<string, unknown> = {}
  if (body.name)       data.name       = body.name.trim()
  if (body.email)      data.email      = body.email.toLowerCase().trim()
  if (body.role)       data.role       = body.role
  if ("department" in body) data.department = body.department ?? null
  if (body.password)   data.passwordHash = await bcrypt.hash(body.password, 10)
  if (typeof body.dailyMessageLimit === "number" && body.dailyMessageLimit >= 0 && body.dailyMessageLimit <= 5000) {
    data.dailyMessageLimit = body.dailyMessageLimit
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, department: true, isActive: true, dailyMessageLimit: true, createdAt: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { id } = await params
  if (id === session.id) return NextResponse.json({ error: "Não é possível excluir o próprio usuário" }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  const msgCount = await prisma.message.count({ where: { agentId: id } })
  if (msgCount > 0) {
    return NextResponse.json(
      { error: `Usuário possui ${msgCount} mensagem(s) vinculada(s). Use "Desativar" para ocultar sem perder histórico.` },
      { status: 409 }
    )
  }

  await prisma.user.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { id } = await params

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, isActive: true } })
  if (!user) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  if (id === session.id) return NextResponse.json({ error: "Não é possível desativar o próprio usuário" }, { status: 400 })

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: !user.isActive },
    select: { id: true, isActive: true },
  })

  return NextResponse.json(updated)
}

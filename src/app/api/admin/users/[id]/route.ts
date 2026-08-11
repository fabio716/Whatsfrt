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

  // Checa TODOS os vínculos que travam o delete no banco (foreign key), não
  // só mensagens — carteira de contatos, atendimentos e cooperativas também
  // impedem. Sem checar aqui, prisma.user.delete falha com erro de
  // constraint não tratado (vira 500 sem JSON, e o front mostra "Erro de
  // conexão" — confuso, não diz o que realmente travou).
  const [msgCount, contactCount, sessionCount, cooperativeCount] = await Promise.all([
    prisma.message.count({ where: { agentId: id } }),
    prisma.contact.count({ where: { assignedUserId: id } }),
    prisma.serviceSession.count({ where: { agentId: id } }),
    prisma.cooperative.count({ where: { assignedUserId: id } }),
  ])
  if (msgCount > 0) {
    return NextResponse.json(
      { error: `Usuário possui ${msgCount} mensagem(s) vinculada(s). Use "Desativar" para ocultar sem perder histórico.` },
      { status: 409 }
    )
  }
  if (contactCount > 0) {
    return NextResponse.json(
      { error: `Usuário tem ${contactCount} contato(s) na carteira. Transfira ou libere os contatos antes, ou use "Desativar".` },
      { status: 409 }
    )
  }
  if (sessionCount > 0) {
    return NextResponse.json(
      { error: `Usuário tem ${sessionCount} atendimento(s) no histórico. Use "Desativar" para ocultar sem perder histórico.` },
      { status: 409 }
    )
  }
  if (cooperativeCount > 0) {
    return NextResponse.json(
      { error: `Usuário está responsável por ${cooperativeCount} cooperativa(s). Reatribua antes, ou use "Desativar".` },
      { status: 409 }
    )
  }

  try {
    await prisma.user.delete({ where: { id } })
  } catch {
    return NextResponse.json(
      { error: "Não foi possível excluir: usuário ainda tem vínculos no sistema. Use \"Desativar\" para ocultar sem perder histórico." },
      { status: 409 },
    )
  }
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

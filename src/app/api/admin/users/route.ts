import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"

export async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  const session = await verifySessionToken(token)
  return session?.role === "ADMIN" ? session : null
}

const USER_SELECT = {
  id: true, name: true, email: true,
  role: true, department: true, isActive: true, createdAt: true,
} as const

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const users = await prisma.user.findMany({
    select: USER_SELECT,
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(users)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  let body: { name?: string; email?: string; password?: string; role?: string; department?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const { name, email, password, role, department } = body
  if (!name?.trim() || !email?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "Nome, e-mail e senha são obrigatórios" }, { status: 400 })
  }

  const exists = await prisma.user.findFirst({ where: { email: email.toLowerCase().trim() } })
  if (exists) return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 400 })

  const validDepts = [
    "VENDAS", "FINANCEIRO", "GERENCIA", "SUPORTE", "ATENDIMENTO",
    "COBRANCA", "MARKETING", "TI", "RH", "COMERCIAL", "EXPEDICAO",
    "POS_VENDAS", "SECRETARIA_ASSISTENCIA", "TECNICOS_ASSISTENCIA",
  ] as const
  type Dept = (typeof validDepts)[number]
  const dept = validDepts.includes(department as Dept) ? (department as Dept) : undefined

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: role === "ADMIN" ? "ADMIN" : "AGENT",
      department: dept,
    },
    select: USER_SELECT,
  })

  return NextResponse.json(user, { status: 201 })
}

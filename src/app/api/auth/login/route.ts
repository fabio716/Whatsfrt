import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { createSessionToken, COOKIE_NAME, SESSION_COOKIE_OPTS } from "@/lib/auth"

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: { email?: string; password?: string }
  try {
    body = (await request.json()) as { email?: string; password?: string }
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const { email, password } = body
  if (!email || !password) {
    return NextResponse.json({ error: "Email e senha são obrigatórios" }, { status: 400 })
  }

  let user
  try {
    user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
    })
  } catch (dbErr) {
    console.error("[login] DB error:", dbErr)
    return NextResponse.json({ error: "Serviço indisponível. Verifique o banco de dados." }, { status: 503 })
  }

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Email ou senha inválidos" }, { status: 401 })
  }

  const token = await createSessionToken({ id: user.id, name: user.name, role: user.role })
  const response = NextResponse.json({ ok: true, name: user.name, role: user.role })
  response.cookies.set(COOKIE_NAME, token, SESSION_COOKIE_OPTS)
  return response
}

import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { createSessionToken, COOKIE_NAME, SESSION_COOKIE_OPTS } from "@/lib/auth"

// Limite por IP+email: 8 tentativas a cada 5 minutos. Compatível com o fallback
// do RedisClient (se Redis cair, .get() retorna null e o login não fica preso).
const RATE_LIMIT_MAX = 8
const RATE_LIMIT_WINDOW_SECONDS = 5 * 60

function clientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return request.headers.get("x-real-ip") ?? "unknown"
}

async function checkRateLimit(key: string): Promise<boolean> {
  const raw = await redis.get(key)
  const count = raw ? Number.parseInt(raw, 10) : 0
  if (count >= RATE_LIMIT_MAX) return false
  await redis.setex(key, RATE_LIMIT_WINDOW_SECONDS, String(count + 1))
  return true
}

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

  const normalizedEmail = email.toLowerCase().trim()
  const ip = clientIp(request)
  const allowed = await checkRateLimit(`login:rl:${ip}:${normalizedEmail}`)
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429 }
    )
  }

  let user
  try {
    user = await prisma.user.findFirst({
      where: { email: normalizedEmail, isActive: true },
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

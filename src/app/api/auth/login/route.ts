import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { createSessionToken, COOKIE_NAME, SESSION_COOKIE_OPTS } from "@/lib/auth"

// Defesa em camadas:
// 1. Rate limit por IP+email: 8 tentativas a cada 5 min (atrasa script local)
// 2. Lock por conta (email): 5 falhas em 15 min trava a conta (defesa contra
//    brute-force distribuido com pool de IPs apontando pra mesma conta).
// Ambos sao fail-open se Redis cair — pos disponibilidade > seguranca aqui.
const RATE_LIMIT_MAX = 8
const RATE_LIMIT_WINDOW_SECONDS = 5 * 60
const ACCOUNT_LOCK_MAX = 5
const ACCOUNT_LOCK_WINDOW_SECONDS = 15 * 60

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

async function isAccountLocked(email: string): Promise<{ locked: boolean; remainingSec: number }> {
  const key = `login:fails:${email}`
  const raw = await redis.get(key)
  const count = raw ? Number.parseInt(raw, 10) : 0
  if (count >= ACCOUNT_LOCK_MAX) {
    const ttl = await redis.ttl(key)
    return { locked: true, remainingSec: Math.max(0, ttl) }
  }
  return { locked: false, remainingSec: 0 }
}

async function recordLoginFailure(email: string): Promise<void> {
  const key = `login:fails:${email}`
  const raw = await redis.get(key)
  const count = raw ? Number.parseInt(raw, 10) : 0
  await redis.setex(key, ACCOUNT_LOCK_WINDOW_SECONDS, String(count + 1))
  if (count + 1 >= ACCOUNT_LOCK_MAX) {
    console.warn(`[login] conta bloqueada por excesso de falhas: ${email} (15 min)`)
  }
}

async function clearLoginFailures(email: string): Promise<void> {
  await redis.del(`login:fails:${email}`)
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

  // 1. Lock por conta — defesa contra brute-force distribuido
  const lock = await isAccountLocked(normalizedEmail)
  if (lock.locked) {
    const minutes = Math.ceil(lock.remainingSec / 60)
    return NextResponse.json(
      { error: `Conta temporariamente bloqueada por excesso de tentativas. Tente em ${minutes} min.` },
      { status: 429, headers: { "Retry-After": String(lock.remainingSec) } }
    )
  }

  // 2. Rate limit por IP+email — atrasa script local rapido
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
    console.error("[login] DB error:", dbErr instanceof Error ? dbErr.message : "unknown")
    return NextResponse.json({ error: "Serviço indisponível. Verifique o banco de dados." }, { status: 503 })
  }

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await recordLoginFailure(normalizedEmail)
    return NextResponse.json({ error: "Email ou senha inválidos" }, { status: 401 })
  }

  // Login ok — limpa contador de falhas
  await clearLoginFailures(normalizedEmail)

  const token = await createSessionToken({ id: user.id, name: user.name, role: user.role })
  const response = NextResponse.json({ ok: true, name: user.name, role: user.role })
  response.cookies.set(COOKIE_NAME, token, SESSION_COOKIE_OPTS)
  return response
}

import { SignJWT, jwtVerify } from "jose"
import { NextResponse, type NextRequest } from "next/server"

export const COOKIE_NAME = "whatsfrt-session"

// JWT secret. Falha-hard em produção quando ausente para evitar que o segredo
// padrão (público no código) seja usado para assinar tokens reais.
function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET ausente ou curto demais (mínimo 32 chars) em produção.")
    }
    return new TextEncoder().encode("dev-secret-change-me-32chars!!")
  }
  return new TextEncoder().encode(s)
}

export interface SessionPayload {
  id: string
  name: string
  role: "ADMIN" | "AGENT"
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  let payload: SessionPayload
  try {
    payload = (await jwtVerify(token, getSecret())).payload as unknown as SessionPayload
  } catch {
    return null
  }
  // O token sozinho não basta: ele se renova a cada 30 min (proxy.ts) sem
  // olhar o banco, então quem fosse desativado — ou rebaixado de admin pra
  // agente — continuava entrando enquanto usasse o sistema. Aqui vale o que
  // está no banco AGORA: inativo = sem sessão; perfil e nome vêm do banco.
  const atual = await usuarioAtual(payload.id)
  if (!atual || !atual.isActive) return null
  return { id: payload.id, name: atual.name, role: atual.role }
}

// ─── Estado atual do usuário (com cache curto) ───────────────────────────────
// Toda requisição autenticada passa aqui; o cache de 60s evita uma consulta
// ao banco por request. Mudança de perfil/ativação vale em até 60s — ou na
// hora, porque a edição de usuário chama esquecerUsuario().
const CACHE_SEG = 60
const chaveCache = (id: string) => `sess:usuario:${id}`

interface UsuarioAtual { name: string; role: "ADMIN" | "AGENT"; isActive: boolean }

async function usuarioAtual(id: string): Promise<UsuarioAtual | null> {
  // Imports dinâmicos: este arquivo também é usado pelo proxy.ts (só as
  // constantes), que não precisa carregar Prisma/Redis.
  const { redis } = await import("@/lib/redis")
  try {
    const cache = await redis.get(chaveCache(id))
    if (cache) return JSON.parse(cache) as UsuarioAtual
  } catch { /* Redis fora: cai no banco */ }

  const { prisma } = await import("@/lib/prisma")
  const u = await prisma.user.findUnique({
    where: { id },
    select: { name: true, role: true, isActive: true },
  })
  if (!u) return null
  const atual: UsuarioAtual = { name: u.name, role: u.role, isActive: u.isActive }
  try { await redis.setex(chaveCache(id), CACHE_SEG, JSON.stringify(atual)) } catch { /* ok */ }
  return atual
}

/** Chamar depois de editar/desativar um usuário, pra valer na hora. */
export async function esquecerUsuario(id: string): Promise<void> {
  try {
    const { redis } = await import("@/lib/redis")
    await redis.del(chaveCache(id))
  } catch { /* expira sozinho em 60s */ }
}

export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 8 * 60 * 60,
}

// Lê e valida a sessão do request. Retorna null se ausente/inválida.
export async function getSessionFromRequest(
  request: { cookies: { get: (name: string) => { value: string } | undefined } },
): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

// ─── Origin guard ─────────────────────────────────────────────────────────────
// Defesa em profundidade contra CSRF: além de SameSite=Lax no cookie, em
// requisições mutadoras (POST/PUT/PATCH/DELETE) checamos se Origin (quando
// presente) bate com APP_PUBLIC_URL. Quando Origin ausente (server-to-server,
// alguns clientes desktop), NÃO bloqueamos — auth JWT ainda cobre.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function originAllowed(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return true
  const origin = request.headers.get("origin")
  if (!origin) return true
  const allowed = process.env.APP_PUBLIC_URL
  if (!allowed) return true
  return origin.replace(/\/+$/, "") === allowed.replace(/\/+$/, "")
}

// ─── Guards para route handlers ───────────────────────────────────────────────
// Retornam ou a sessão (sucesso) ou um NextResponse com erro (falha).

export async function requireSession(
  request: NextRequest,
): Promise<SessionPayload | NextResponse> {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Origin não permitido" }, { status: 403 })
  }
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  return session
}

export async function requireAdmin(
  request: NextRequest,
): Promise<SessionPayload | NextResponse> {
  if (!originAllowed(request)) {
    return NextResponse.json({ error: "Origin não permitido" }, { status: 403 })
  }
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 })
  }
  return session
}

export function isErrorResponse(
  result: SessionPayload | NextResponse,
): result is NextResponse {
  return result instanceof NextResponse
}

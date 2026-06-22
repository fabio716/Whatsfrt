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
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
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

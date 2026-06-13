import { SignJWT, jwtVerify } from "jose"

export const COOKIE_NAME = "whatsfrt-session"
const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me-32chars!!")

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
    .sign(secret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
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

// Reads and verifies the session from a request's cookies. Returns null if absent/invalid.
export async function getSessionFromRequest(
  request: { cookies: { get: (name: string) => { value: string } | undefined } },
): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return null
  return verifySessionToken(token)
}

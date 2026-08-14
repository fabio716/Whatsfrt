import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { COOKIE_NAME } from "@/lib/auth"

// Mesma política de auth.ts: falha-hard em produção.
function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET ausente ou curto demais em produção.")
    }
    return new TextEncoder().encode("dev-secret-change-me-32chars!!")
  }
  return new TextEncoder().encode(s)
}

// Áreas restritas a ADMIN. AGENT recebe 403/redirect para /admin/chats.
// "/admin/contatos" saiu daqui: agora aberta pro AGENT tambem (só leitura +
// sincronizar fotos + importar — exportar CSV e liberar contato continuam
// admin-only via gate interno das respectivas rotas).
const ADMIN_ONLY_PREFIXES = [
  "/admin/metrics",
  "/admin/users",
  "/admin/ura",
  "/admin/ura-motor",
  "/admin/connect",
  "/admin/equipe-ao-vivo",
  "/admin/avaliacoes",
]

// APIs sob /api/admin/* que AGENT tambem pode chamar. Sao endpoints que
// existem no path admin por historico, mas fazem parte do fluxo de
// atendimento do agente (assumir contato da Fila). A auth interna da rota
// continua fazendo o gate por ownership/dept quando aplicavel.
const AGENT_ALLOWED_ADMIN_APIS = [
  /^\/api\/admin\/contacts\/[^/]+\/assign$/,
  /^\/api\/admin\/contacts\/[^/]+\/transfer$/,
  // Tela de Contatos aberta pro agente — leitura, sincronizar fotos, importar,
  // e editar nome/telefone (PATCH). DELETE na mesma rota [id] continua
  // admin-only (o proprio route.ts checa role dentro do handler).
  // Exportar (/export) e liberar ([id]/release) NAO estao aqui, continuam
  // admin-only (o proprio route.ts deles usa requireAdmin).
  /^\/api\/admin\/contacts$/,
  /^\/api\/admin\/contacts\/[^/]+$/,
  /^\/api\/admin\/contacts\/sync-photos$/,
  /^\/api\/admin\/contacts\/import$/,
  /^\/api\/admin\/ura\/cooperatives$/,
]

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE_NAME)?.value

  if (!token) {
    // Para APIs, devolve 401 JSON ao invés de redirect HTML.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    return NextResponse.redirect(new URL("/login", request.url))
  }

  try {
    const { payload } = await jwtVerify(token, getSecret())
    const role = (payload as { role?: string }).role

    // ADMIN passa em tudo.
    if (role === "ADMIN") return NextResponse.next()

    // AGENT acessando área admin-only: bloquear.
    const isAdminOnlyPage = ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
    const isAgentAllowed = AGENT_ALLOWED_ADMIN_APIS.some((re) => re.test(pathname))
    const isAdminOnlyApi = pathname.startsWith("/api/admin/") && !isAgentAllowed
    if (isAdminOnlyPage) {
      return NextResponse.redirect(new URL("/admin/chats", request.url))
    }
    if (isAdminOnlyApi) {
      return NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 })
    }
    return NextResponse.next()
  } catch {
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Sessão inválida" }, { status: 401 })
      response.cookies.delete(COOKIE_NAME)
      return response
    }
    const response = NextResponse.redirect(new URL("/login", request.url))
    response.cookies.delete(COOKIE_NAME)
    return response
  }
}

// Cobre todas as áreas autenticadas. APIs públicas legítimas (auth, webhooks
// Evolution) ficam de fora — elas validam seus próprios shared secrets.
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/messages/:path*",
    "/api/broadcast/:path*",
    "/api/contacts/:path*",
    "/api/whatsapp/:path*",
    "/api/sse",
  ],
}

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rateLimit"
import { parecerDoRetorno } from "@/lib/gerenteParecer"

export const dynamic = "force-dynamic"

// Parecer do gerente virtual sobre um retorno (só sugere; quem decide é o admin).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const corpo = (await request.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof corpo?.id === "string" ? corpo.id : ""
  if (!id) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 })
  const limite = await checkRateLimit(`rl:gerente-parecer:${auth.id}`, 60, 3600)
  if (!limite.allowed) return NextResponse.json({ erro: "Muitos pareceres em pouco tempo." }, { status: 429 })

  const p = await parecerDoRetorno(id)
  if (p === "SEM_IA") return NextResponse.json({ erro: "A IA não está configurada." }, { status: 503 })
  if (!p) return NextResponse.json({ erro: "Não consegui analisar este retorno agora." }, { status: 502 })
  return NextResponse.json(p)
}

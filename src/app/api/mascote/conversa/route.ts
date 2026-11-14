import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rateLimit"
import { falarComoMascote, type MensagemPapo, type ModoPapo } from "@/lib/mascoteIA"

export const dynamic = "force-dynamic"

// Conversa do mascote com a pessoa logada. Limite por pessoa (custo da IA):
// 40 trocas por hora. 503 = IA indisponível → o painel usa as falas prontas.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const corpo = (await request.json().catch(() => null)) as { modo?: unknown; mensagens?: unknown } | null
  const modo: ModoPapo = corpo?.modo === "cobranca" ? "cobranca" : "papo"
  const bruto = Array.isArray(corpo?.mensagens) ? corpo.mensagens : []
  const historico: MensagemPapo[] = bruto
    .slice(-10)
    .map((m) => m as { role?: unknown; texto?: unknown })
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.texto === "string" && m.texto.trim())
    .map((m) => ({ role: m.role as "user" | "assistant", texto: String(m.texto).trim().slice(0, 400) }))
  // A conversa precisa terminar na fala da pessoa (ou começar vazia).
  if (historico.length && historico[historico.length - 1].role !== "user") {
    return NextResponse.json({ erro: "Histórico inválido." }, { status: 400 })
  }

  const limite = await checkRateLimit(`rl:mascote-papo:${auth.id}`, 40, 3600)
  if (!limite.allowed) return NextResponse.json({ erro: "Muitas conversas em pouco tempo." }, { status: 429 })

  const resposta = await falarComoMascote(auth.id, modo, historico)
  if (!resposta) return NextResponse.json({ erro: "Mascote sem IA agora." }, { status: 503 })
  return NextResponse.json({ resposta })
}

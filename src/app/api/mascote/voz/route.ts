import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rateLimit"
import { limparFala, sintetizarVoz, vozConfigurada } from "@/lib/vozMascote"

export const dynamic = "force-dynamic"

// Fala do mascote em áudio. Só equipe logada; limite por pessoa pra não gastar
// o pacote de voz à toa. 503 = sem chave → o painel usa a voz do navegador.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  if (!vozConfigurada()) return NextResponse.json({ erro: "Voz não configurada." }, { status: 503 })

  const limite = await checkRateLimit(`rl:mascote-voz:${auth.id}`, 20, 600)
  if (!limite.allowed) return NextResponse.json({ erro: "Muitas falas em pouco tempo." }, { status: 429 })

  const corpo = (await request.json().catch(() => null)) as { texto?: unknown } | null
  const texto = typeof corpo?.texto === "string" ? limparFala(corpo.texto) : ""
  if (!texto) return NextResponse.json({ erro: "Texto vazio." }, { status: 400 })

  const audio = await sintetizarVoz(texto)
  if (!audio) return NextResponse.json({ erro: "Não consegui gerar a voz." }, { status: 502 })
  return new NextResponse(new Uint8Array(audio), {
    headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" },
  })
}

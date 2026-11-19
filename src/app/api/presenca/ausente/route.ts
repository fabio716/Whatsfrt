import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { ausenciaDe, encerrarAusencia, iniciarAusencia, PRAZO_MAXIMO_MIN } from "@/lib/ausencia"
import { sendPushToUsers } from "@/lib/push"
import { checkRateLimit } from "@/lib/rateLimit"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const a = await ausenciaDe(auth.id)
  return NextResponse.json({ ausente: a !== null, desde: a?.desde ?? null, ate: a?.ate ?? null, prazoMin: PRAZO_MAXIMO_MIN })
}

// Saiu por alguns minutos. O motivo é um texto livre OPCIONAL (só o administrador vê);
// não há limite de vezes por dia (só um freio contra clique repetido). O tempo até
// voltar fica registrado.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const limite = await checkRateLimit(`rl:ausencia:${auth.id}`, 30, 3600)
  if (!limite.allowed) return NextResponse.json({ erro: "Muitos toques em pouco tempo. Aguarde um instante." }, { status: 429 })
  const corpo = (await request.json().catch(() => null)) as { motivo?: unknown } | null
  const a = await iniciarAusencia(auth.id, typeof corpo?.motivo === "string" ? corpo.motivo : undefined)
  return NextResponse.json({ ausente: true, desde: a.desde, ate: a.ate, prazoMin: PRAZO_MAXIMO_MIN })
}

// Voltei.
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { minutos, recados } = await encerrarAusencia(auth.id)
  if (recados > 0) {
    sendPushToUsers([auth.id], {
      title: "👋 Bem-vindo(a) de volta", body: `${recados} cliente(s) escreveram enquanto você estava ausente. Confira seus chats.`,
      tag: "ausencia-recap", url: "/admin/chats",
    }).catch(() => {})
  }
  return NextResponse.json({ ausente: false, minutos, recados })
}

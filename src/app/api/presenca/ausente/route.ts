import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { MOTIVOS, ausenciaDe, encerrarAusencia, iniciarAusencia, type MotivoAusencia } from "@/lib/ausencia"
import { sendPushToUsers } from "@/lib/push"
import { checkRateLimit } from "@/lib/rateLimit"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const a = await ausenciaDe(auth.id)
  return NextResponse.json({ ausente: a !== null, ...(a ?? {}), motivos: Object.entries(MOTIVOS).map(([id, m]) => ({ id, rotulo: m.rotulo, minutos: m.minutos })) })
}

// Sai por alguns minutos.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const corpo = (await request.json().catch(() => null)) as { motivo?: unknown } | null
  const motivo = corpo?.motivo as MotivoAusencia
  if (!motivo || !(motivo in MOTIVOS)) return NextResponse.json({ erro: "Escolha o motivo." }, { status: 400 })
  // Limite generoso: evita ficar "ausente" o dia todo apertando o botão de novo.
  const limite = await checkRateLimit(`rl:ausencia:${auth.id}`, 8, 8 * 3600)
  if (!limite.allowed) return NextResponse.json({ erro: "Você já usou a ausência várias vezes hoje. Fale com o administrador." }, { status: 429 })
  const a = await iniciarAusencia(auth.id, motivo)
  return NextResponse.json({ ausente: true, ...a })
}

// Voltei.
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const recados = await encerrarAusencia(auth.id)
  if (recados > 0) {
    sendPushToUsers([auth.id], {
      title: "👋 Bem-vindo(a) de volta", body: `${recados} cliente(s) escreveram enquanto você estava ausente. Confira seus chats.`,
      tag: "ausencia-recap", url: "/admin/chats",
    }).catch(() => {})
  }
  return NextResponse.json({ ausente: false, recados })
}

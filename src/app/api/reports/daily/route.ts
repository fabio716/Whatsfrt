import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { gerarRelatorioDiario, formatarParaWhatsApp, hojeNoBrasil } from "@/lib/reports/dailyReport"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/

// ─── GET /api/reports/daily?dia=2026-09-25&texto=1 ────────────────────────────
// Relatório de atendimento de um dia. Sem `dia`, usa hoje (fuso do Brasil).
// Com `texto=1`, devolve já formatado como a mensagem que vai pro WhatsApp —
// útil pra conferir o que a equipe vai receber antes de ligar o envio diário.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const pedido = request.nextUrl.searchParams.get("dia")
  if (pedido && !DIA_VALIDO.test(pedido)) {
    return NextResponse.json({ error: "Use dia=AAAA-MM-DD" }, { status: 400 })
  }
  const dia = pedido ?? hojeNoBrasil()

  const relatorio = await gerarRelatorioDiario(dia)

  if (request.nextUrl.searchParams.get("texto") === "1") {
    return new NextResponse(formatarParaWhatsApp(relatorio), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  return NextResponse.json(relatorio)
}

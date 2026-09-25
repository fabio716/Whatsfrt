import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { sendTextOk } from "@/lib/whatsapp"
import { gerarRelatorioDiario, formatarParaWhatsApp, hojeNoBrasil } from "@/lib/reports/dailyReport"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/

// ─── POST /api/reports/daily/send ─────────────────────────────────────────────
// Monta o relatório do dia e manda pro WhatsApp de quem está em REPORT_PHONE.
// Chamado pelo cron do servidor às 18h nos dias úteis.
//
// Não usa sessão (cron não tem login): autentica por segredo em
// REPORT_CRON_SECRET, comparado em tempo constante. Sem o segredo configurado
// a rota fica DESLIGADA — não existe modo "aceita qualquer um", senão
// qualquer pessoa na internet puxaria o desempenho da equipe.
function segredoOk(request: NextRequest): boolean {
  const esperado = process.env.REPORT_CRON_SECRET
  if (!esperado) return false
  const recebido =
    request.headers.get("x-report-secret") ??
    request.nextUrl.searchParams.get("secret") ??
    ""
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!segredoOk(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const destino = process.env.REPORT_PHONE?.trim()
  if (!destino) {
    return NextResponse.json({ error: "REPORT_PHONE não configurado" }, { status: 500 })
  }

  const pedido = request.nextUrl.searchParams.get("dia")
  if (pedido && !DIA_VALIDO.test(pedido)) {
    return NextResponse.json({ error: "Use dia=AAAA-MM-DD" }, { status: 400 })
  }
  const dia = pedido ?? hojeNoBrasil()

  const relatorio = await gerarRelatorioDiario(dia)
  const texto = formatarParaWhatsApp(relatorio)
  const ok = await sendTextOk(destino, texto)

  // 200 mesmo quando o envio falha: o cron não deve ficar reenviando e
  // duplicando relatório. O campo `enviado` diz o que aconteceu, e fica no log.
  console.log(`[relatorio] ${dia} → ${destino}: ${ok ? "enviado" : "FALHOU"}`)
  return NextResponse.json({ dia, enviado: ok, vendedoras: relatorio.vendedoras.length })
}

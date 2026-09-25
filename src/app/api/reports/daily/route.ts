import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import {
  gerarRelatorio,
  gerarRelatorioDiario,
  formatarParaWhatsApp,
  hojeNoBrasil,
  resolverPeriodo,
  type TipoPeriodo,
} from "@/lib/reports/dailyReport"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/
const TIPOS: TipoPeriodo[] = ["dia", "semana", "mes"]

// ─── GET /api/reports/daily ───────────────────────────────────────────────────
//   ?dia=2026-09-25       data de referência (padrão: hoje no Brasil)
//   ?periodo=dia|semana|mes   janela (padrão: dia)
//   ?texto=1              devolve a mensagem que iria pro WhatsApp (só dia)
//
// Junto com os números do período vem `anterior`, com os totais da mesma
// janela imediatamente antes — é o que responde "estamos melhorando?".
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const q = request.nextUrl.searchParams
  const pedido = q.get("dia")
  if (pedido && !DIA_VALIDO.test(pedido)) {
    return NextResponse.json({ error: "Use dia=AAAA-MM-DD" }, { status: 400 })
  }
  const ref = pedido ?? hojeNoBrasil()

  // O texto do WhatsApp é sempre de um dia — o formato da mensagem foi feito
  // pra isso, e é o mesmo que o cron manda às 18h.
  if (q.get("texto") === "1") {
    const relatorio = await gerarRelatorioDiario(ref)
    return new NextResponse(formatarParaWhatsApp(relatorio), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }

  const tipoBruto = q.get("periodo") ?? "dia"
  if (!TIPOS.includes(tipoBruto as TipoPeriodo)) {
    return NextResponse.json({ error: "Use periodo=dia, semana ou mes" }, { status: 400 })
  }
  const periodo = resolverPeriodo(tipoBruto as TipoPeriodo, ref)

  // Período inteiro no futuro: janela de zero. Não roda consulta nenhuma.
  const vazio = periodo.fim.getTime() <= periodo.ini.getTime()

  const [atual, anterior] = await Promise.all([
    vazio ? null : gerarRelatorio(periodo.rotulo, periodo.ini, periodo.fim),
    vazio || periodo.fimAnterior.getTime() <= periodo.iniAnterior.getTime()
      ? null
      : gerarRelatorio("anterior", periodo.iniAnterior, periodo.fimAnterior),
  ])

  return NextResponse.json({
    periodo: {
      tipo: periodo.tipo,
      de: periodo.de,
      ate: periodo.ate,
      rotulo: periodo.rotulo,
      emAndamento: periodo.fim.getTime() < new Date(`${periodo.ate}T23:59:59-03:00`).getTime(),
    },
    dia: atual?.dia ?? periodo.rotulo,
    totais: atual?.totais ?? {
      atendimentos: 0, conversas: 0, mensagens: 0, respostas: 0,
      mediaSeg: null, lentas: 0, notas: 0, notaMedia: null, notasBaixas: 0,
    },
    vendedoras: atual?.vendedoras ?? [],
    anterior: anterior?.totais ?? null,
  })
}

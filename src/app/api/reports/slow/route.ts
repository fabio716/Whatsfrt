import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { listarRespostasLentas, hojeNoBrasil, resolverPeriodo, type TipoPeriodo } from "@/lib/reports/dailyReport"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/
const TIPOS: TipoPeriodo[] = ["dia", "semana", "mes"]

// ─── GET /api/reports/slow?dia=&periodo=&agente= ──────────────────────────────
// Os casos concretos por trás do número "acima de 1h": qual cliente esperou,
// quanto, e o que ele tinha perguntado. Inclui quem nunca foi respondido —
// pro cliente é a mesma coisa, e é o pior dos dois.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const q = request.nextUrl.searchParams
  const pedido = q.get("dia")
  if (pedido && !DIA_VALIDO.test(pedido)) {
    return NextResponse.json({ error: "Use dia=AAAA-MM-DD" }, { status: 400 })
  }
  const tipo = q.get("periodo") ?? "dia"
  if (!TIPOS.includes(tipo as TipoPeriodo)) {
    return NextResponse.json({ error: "Use periodo=dia, semana ou mes" }, { status: 400 })
  }

  const periodo = resolverPeriodo(tipo as TipoPeriodo, pedido ?? hojeNoBrasil())
  if (periodo.fim.getTime() <= periodo.ini.getTime()) {
    return NextResponse.json({ casos: [] })
  }

  const agente = q.get("agente")?.trim() || undefined
  const casos = await listarRespostasLentas(periodo.ini, periodo.fim, agente)
  return NextResponse.json({ casos })
}

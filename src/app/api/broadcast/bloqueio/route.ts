import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth"
import { CAUTELA, cautelaAte, dataBr } from "@/lib/bloqueioTransmissao"

// GET /api/broadcast/bloqueio — a tela de transmissão pergunta se o modo
// cautela está ligado, pra mostrar o aviso com os limites.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const ate = cautelaAte()
  if (!ate) return NextResponse.json({ cautela: false })
  return NextResponse.json({ cautela: true, ate: dataBr(ate), ...CAUTELA })
}

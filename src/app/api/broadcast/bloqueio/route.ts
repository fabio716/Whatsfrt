import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth"
import { LIMITES_SEGUROS } from "@/lib/bloqueioTransmissao"

// GET /api/broadcast/bloqueio — limites seguros, pra tela de transmissão
// mostrar as regras.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  return NextResponse.json(LIMITES_SEGUROS)
}

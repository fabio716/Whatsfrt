import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { marcarPresenca } from "@/lib/presence"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── POST /api/presence ───────────────────────────────────────────────────────
// Batida de ponto do navegador: "estou aqui, com a tela à vista". Chamada a
// cada 30s pelo painel. É de propósito a coisa mais barata possível — uma
// escrita no Redis com validade — porque roda por pessoa, o dia todo.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  await marcarPresenca(auth.id)
  return NextResponse.json({ ok: true })
}

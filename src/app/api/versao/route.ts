import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/versao — marca do build que está rodando no servidor. As abas
// abertas comparam com a marca do código delas pra saber se saiu versão nova.
// Sem dado sensível, por isso sem login.
export function GET(): NextResponse {
  return NextResponse.json(
    { versao: process.env.NEXT_PUBLIC_VERSAO_BUILD ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  )
}

import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { disconnectInstance } from "@/lib/whatsapp"

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const ok = await disconnectInstance()
  if (!ok) return NextResponse.json({ error: "Falha ao desconectar" }, { status: 502 })
  return NextResponse.json({ ok: true })
}

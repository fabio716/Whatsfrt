import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { activeProvider } from "@/lib/whatsapp"
import { getZapiPhoneCode } from "@/lib/zapi"

export const dynamic = "force-dynamic"

// ─── POST /api/whatsapp/phone-code ────────────────────────────────────────────
// Gera o código de conexão da Z-API (alternativa ao QR): digita-se no WhatsApp
// do celular em "Dispositivos conectados → Conectar com número de telefone".
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  if (activeProvider() !== "zapi") {
    return NextResponse.json({ error: "Código de telefone só está disponível com a Z-API" }, { status: 400 })
  }

  let body: { phone?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const digits = (body.phone ?? "").replace(/\D/g, "")
  // DDI + DDD + número: 12 ou 13 dígitos no Brasil (55 + 2 + 8/9).
  if (digits.length < 12 || digits.length > 13 || !digits.startsWith("55")) {
    return NextResponse.json(
      { error: "Informe o número completo da empresa com 55 e DDD, ex: 5543999998888" },
      { status: 400 },
    )
  }

  const { code, error } = await getZapiPhoneCode(digits)
  if (!code) {
    return NextResponse.json({ error: `Não foi possível gerar o código: ${error}` }, { status: 502 })
  }
  return NextResponse.json({ code })
}

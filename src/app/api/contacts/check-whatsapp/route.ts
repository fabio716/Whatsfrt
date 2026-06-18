import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { normalizePhone } from "@/lib/contactImport"
import { validateNumberOnWhatsApp, activeProvider } from "@/lib/whatsapp"

// POST /api/contacts/check-whatsapp
// Verifica se um número está cadastrado no WhatsApp via Z-API.
//
// Resposta:
//   { provider: "zapi", phone: "5511...", exists: true|false|null }
//   exists=null  → não foi possível verificar (provider não suporta ou erro)
//   exists=true  → número existe no WhatsApp, mensagens vão chegar
//   exists=false → número NÃO existe no WhatsApp, mensagens vão falhar
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let body: { phone?: string }
  try {
    body = (await request.json()) as { phone?: string }
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  if (!body.phone?.trim()) {
    return NextResponse.json({ error: "Telefone obrigatório" }, { status: 400 })
  }

  const whatsappId = normalizePhone(body.phone.trim())
  if (!whatsappId) {
    return NextResponse.json({
      provider: activeProvider(),
      phone: null,
      exists: false,
      message: "Formato inválido. Use DDD + número (ex: 11 99999-9999)",
    })
  }

  const phone = whatsappId.replace("@s.whatsapp.net", "")
  const exists = await validateNumberOnWhatsApp(whatsappId)

  return NextResponse.json({
    provider: activeProvider(),
    phone,
    exists,
    message: exists === null
      ? "Verificação indisponível neste provedor"
      : exists
        ? "Número cadastrado no WhatsApp"
        : "Número NÃO está no WhatsApp — mensagens não vão chegar",
  })
}

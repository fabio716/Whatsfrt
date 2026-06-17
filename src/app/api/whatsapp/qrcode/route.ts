import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { activeProvider } from "@/lib/whatsapp"
import { getZapiQrCode } from "@/lib/zapi"

interface EvolutionQRResponse {
  code?: string
  base64?: string
  pairingCode?: string | null
}

async function createInstance(apiUrl: string, apiKey: string, instance: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        instanceName: instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
    })
    return res.ok || res.status === 409
  } catch {
    return false
  }
}

async function fetchQR(apiUrl: string, apiKey: string, instance: string): Promise<Response> {
  return fetch(`${apiUrl}/instance/connect/${instance}`, {
    headers: { apikey: apiKey },
    cache: "no-store",
  })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  if (activeProvider() === "zapi") {
    const { base64, connected } = await getZapiQrCode()
    if (connected) {
      return NextResponse.json({ connected: true })
    }
    if (!base64) {
      return NextResponse.json({ error: "Z-API não retornou QR code" }, { status: 500 })
    }
    return NextResponse.json({
      base64: base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`,
      code: null,
    })
  }

  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json(
      { error: "Variáveis de ambiente da Evolution API não configuradas" },
      { status: 500 }
    )
  }

  try {
    let res = await fetchQR(apiUrl, apiKey, instance)

    if (res.status === 404) {
      const created = await createInstance(apiUrl, apiKey, instance)
      if (!created) {
        return NextResponse.json(
          { error: "Instância não encontrada e não foi possível criá-la automaticamente." },
          { status: 500 }
        )
      }
      await new Promise((r) => setTimeout(r, 1500))
      res = await fetchQR(apiUrl, apiKey, instance)
    }

    if (!res.ok) {
      const body = await res.text()
      return NextResponse.json(
        { error: `Evolution API retornou ${res.status}: ${body}` },
        { status: res.status }
      )
    }

    const data = (await res.json()) as EvolutionQRResponse
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro de rede"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

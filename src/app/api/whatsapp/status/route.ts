import { NextResponse } from "next/server"

interface EvolutionStateResponse {
  instance?: {
    instanceName: string
    state: "open" | "close" | "connecting" | "qrcode"
  }
}

export async function GET(): Promise<NextResponse> {
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
    const res = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
      cache: "no-store",
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Evolution API retornou ${res.status}` },
        { status: res.status }
      )
    }

    const data = (await res.json()) as EvolutionStateResponse
    return NextResponse.json(data)
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro de rede"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

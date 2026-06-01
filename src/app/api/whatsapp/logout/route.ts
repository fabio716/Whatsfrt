import { NextResponse } from "next/server"

export async function POST(): Promise<NextResponse> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ error: "Variáveis de ambiente não configuradas" }, { status: 500 })
  }

  try {
    const res = await fetch(`${apiUrl}/instance/logout/${instance}`, {
      method: "DELETE",
      headers: { apikey: apiKey },
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro de rede"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

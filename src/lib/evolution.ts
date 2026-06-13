export async function sendEvolutionText(whatsappId: string, text: string): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) {
    console.error("[URA OUTBOUND ERROR] Variáveis de ambiente ausentes:", {
      hasApiUrl: !!apiUrl, hasApiKey: !!apiKey, hasInstance: !!instance,
    })
    return false
  }

  const number = whatsappId.endsWith("@g.us")
    ? whatsappId
    : whatsappId.replace("@s.whatsapp.net", "").replace(/@.*/, "")

  const url = `${apiUrl}/message/sendText/${instance}`
  console.log("[URA OUTBOUND ATTEMPT] Enviando para:", url, "number:", number)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, text }),
    })
    const respText = await res.text()
    if (!res.ok) {
      console.error("[URA OUTBOUND ERROR] Falha Evolution API:", res.status, respText)
      return false
    }
    console.log("[URA OUTBOUND SUCCESS]:", res.status, respText)
    return true
  } catch (err) {
    console.error("[URA OUTBOUND EXCEPTION]:", err)
    return false
  }
}

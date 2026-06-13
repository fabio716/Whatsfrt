// Fetches the base64 content of an inbound media message from Evolution.
// Evolution does not include base64 in the webhook unless webhookBase64 is on,
// so we retrieve it on demand using the message key.
export async function fetchMediaBase64(
  key: { id: string; remoteJid: string; fromMe: boolean },
): Promise<{ base64: string; mimetype?: string } | null> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) return null

  try {
    const res = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: { key }, convertToMp4: false }),
    })
    if (!res.ok) {
      console.error("[MEDIA FETCH ERROR] Evolution API:", res.status, await res.text())
      return null
    }
    const data = (await res.json()) as { base64?: string; mimetype?: string }
    if (!data.base64) return null
    return { base64: data.base64, mimetype: data.mimetype }
  } catch (err) {
    console.error("[MEDIA FETCH EXCEPTION]:", err)
    return null
  }
}

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

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, text }),
    })
    if (!res.ok) {
      const respText = await res.text()
      console.error("[URA OUTBOUND ERROR] Falha Evolution API:", res.status, respText)
      return false
    }
    return true
  } catch (err) {
    console.error("[URA OUTBOUND EXCEPTION]:", err)
    return false
  }
}

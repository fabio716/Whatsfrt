export async function sendEvolutionText(whatsappId: string, text: string): Promise<boolean> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) return false

  const number = whatsappId.endsWith("@g.us")
    ? whatsappId
    : whatsappId.replace("@s.whatsapp.net", "")

  try {
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number, text }),
    })
    return res.ok
  } catch {
    return false
  }
}

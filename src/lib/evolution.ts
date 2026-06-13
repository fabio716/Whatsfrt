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

// Public base URL so Evolution can download media we stored locally.
// Prefers APP_PUBLIC_URL, falls back to the origin of EVOLUTION_WEBHOOK_URL.
export function resolvePublicBaseUrl(): string | null {
  const explicit = process.env.APP_PUBLIC_URL
  if (explicit) return explicit.replace(/\/$/, "")
  const webhook = process.env.EVOLUTION_WEBHOOK_URL
  if (webhook) {
    try {
      return new URL(webhook).origin
    } catch {
      return null
    }
  }
  return null
}

function evolutionMediaType(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "image"
  if (mimetype.startsWith("video/")) return "video"
  if (mimetype.startsWith("audio/")) return "audio"
  return "document"
}

export interface CampaignSendResult {
  ok: boolean
  messageId: string | null
}

// Sends a campaign message (text, or media with caption) and returns the
// WhatsApp message key id so delivery/read receipts can be matched later.
export async function sendCampaignMessage(
  whatsappId: string,
  opts: { text: string; mediaUrl?: string | null; mediaType?: string | null; fileName?: string | null },
): Promise<CampaignSendResult> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) {
    console.error("[CAMPAIGN SEND ERROR] Variáveis de ambiente ausentes")
    return { ok: false, messageId: null }
  }

  const number = whatsappId.endsWith("@g.us")
    ? whatsappId
    : whatsappId.replace("@s.whatsapp.net", "").replace(/@.*/, "")

  const hasMedia = Boolean(opts.mediaUrl && opts.mediaType)
  const publicBase = resolvePublicBaseUrl()

  let url: string
  let payload: Record<string, unknown>

  if (hasMedia && publicBase) {
    url = `${apiUrl}/message/sendMedia/${instance}`
    payload = {
      number,
      mediatype: evolutionMediaType(opts.mediaType as string),
      mimetype: opts.mediaType,
      caption: opts.text,
      media: `${publicBase}${opts.mediaUrl}`,
      fileName: opts.fileName ?? (opts.mediaUrl as string).split("/").pop(),
    }
  } else {
    url = `${apiUrl}/message/sendText/${instance}`
    payload = { number, text: opts.text }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      console.error("[CAMPAIGN SEND ERROR] Falha Evolution API:", res.status, await res.text())
      return { ok: false, messageId: null }
    }
    const data = (await res.json()) as { key?: { id?: string } }
    return { ok: true, messageId: data?.key?.id ?? null }
  } catch (err) {
    console.error("[CAMPAIGN SEND EXCEPTION]:", err)
    return { ok: false, messageId: null }
  }
}

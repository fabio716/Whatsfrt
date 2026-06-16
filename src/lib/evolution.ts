import { evolutionFetch } from "@/lib/reliability/evolutionFetch"
import { signMediaUrl } from "@/lib/mediaStorage"

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

  const res = await evolutionFetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
    label: "fetch-media",
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ message: { key }, convertToMp4: false }),
  })
  if (!res.ok) {
    console.error("[MEDIA FETCH ERROR]:", res.status, res.lastError)
    return null
  }
  const data = res.responseJson as { base64?: string; mimetype?: string } | null
  if (!data?.base64) return null
  return { base64: data.base64, mimetype: data.mimetype }
}

export interface EvolutionSendResult {
  ok: boolean
  messageId: string | null
  attempts: number
  errorMsg: string | null
}

export async function sendEvolutionText(
  whatsappId: string,
  text: string,
): Promise<boolean> {
  const r = await sendEvolutionTextDetailed(whatsappId, text)
  return r.ok
}

export async function sendEvolutionTextDetailed(
  whatsappId: string,
  text: string,
): Promise<EvolutionSendResult> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) {
    console.error("[OUTBOUND ERROR] env ausente:", { hasApiUrl: !!apiUrl, hasApiKey: !!apiKey, hasInstance: !!instance })
    return { ok: false, messageId: null, attempts: 0, errorMsg: "env ausente" }
  }

  const number = whatsappId.endsWith("@g.us")
    ? whatsappId
    : whatsappId.replace("@s.whatsapp.net", "").replace(/@.*/, "")

  const res = await evolutionFetch(`${apiUrl}/message/sendText/${instance}`, {
    label: "send-text",
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ number, text }),
  })

  if (!res.ok) {
    console.error("[OUTBOUND ERROR]", res.status, res.lastError, `attempts=${res.attempts}`)
    return { ok: false, messageId: null, attempts: res.attempts, errorMsg: res.lastError ?? `status ${res.status}` }
  }
  const data = res.responseJson as { key?: { id?: string } } | null
  return { ok: true, messageId: data?.key?.id ?? null, attempts: res.attempts, errorMsg: null }
}

// Public base URL so Evolution can download media we stored locally.
// Prefers APP_PUBLIC_URL, falls back to the origin of EVOLUTION_WEBHOOK_URL.
export function resolvePublicBaseUrl(): string | null {
  const explicit = process.env.APP_PUBLIC_URL
  if (explicit) return explicit.replace(/\/$/, "")
  const webhook = process.env.EVOLUTION_WEBHOOK_URL
  if (webhook) {
    try { return new URL(webhook).origin } catch { return null }
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
    console.error("[CAMPAIGN SEND ERROR] env ausente")
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
    // Para mídia salva como /api/media/<filename>, assina pra Evolution baixar.
    const mediaUrl = opts.mediaUrl as string
    const isPrivate = mediaUrl.startsWith("/api/media/")
    let mediaSource = `${publicBase}${mediaUrl}`
    if (isPrivate) {
      const filename = mediaUrl.replace("/api/media/", "")
      const { queryString } = signMediaUrl(filename, 300)
      mediaSource = `${publicBase}${mediaUrl}?${queryString}`
    }

    url = `${apiUrl}/message/sendMedia/${instance}`
    payload = {
      number,
      mediatype: evolutionMediaType(opts.mediaType as string),
      mimetype: opts.mediaType,
      caption: opts.text,
      media: mediaSource,
      fileName: opts.fileName ?? mediaUrl.split("/").pop(),
    }
  } else {
    url = `${apiUrl}/message/sendText/${instance}`
    payload = { number, text: opts.text }
  }

  const res = await evolutionFetch(url, {
    label: "campaign-send",
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    console.error("[CAMPAIGN SEND ERROR]", res.status, res.lastError, `attempts=${res.attempts}`)
    return { ok: false, messageId: null }
  }
  const data = res.responseJson as { key?: { id?: string } } | null
  return { ok: true, messageId: data?.key?.id ?? null }
}

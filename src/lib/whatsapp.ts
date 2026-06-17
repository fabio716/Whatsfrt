// ═══════════════════════════════════════════════════════════════════════════
// WhatsApp dispatcher — escolhe entre Evolution e Z-API conforme env.
//
// Uso em todo o código:
//   import { sendText, getConnectionState } from "@/lib/whatsapp"
//
// Em vez de chamar diretamente lib/evolution ou lib/zapi.
// ═══════════════════════════════════════════════════════════════════════════

import {
  fetchMediaBase64 as fetchEvolutionMediaBase64,
  resolvePublicBaseUrl,
  sendEvolutionTextDetailed,
  type EvolutionSendResult,
} from "@/lib/evolution"
import { evolutionFetch } from "@/lib/reliability/evolutionFetch"
import type { EvolutionState } from "@/lib/reliability/events"
import {
  disconnectZapi,
  getZapiConnectionState,
  getZapiQrCode,
  isZapiEnvOk,
  sendZapiMedia,
  sendZapiText,
  zapiPhoneExists,
  type ZapiSendResult,
} from "@/lib/zapi"
import { signMediaUrl } from "@/lib/mediaStorage"

export type WhatsAppProvider = "evolution" | "zapi"

export function activeProvider(): WhatsAppProvider {
  const v = (process.env.WHATSAPP_PROVIDER ?? "evolution").toLowerCase()
  if (v === "zapi" && isZapiEnvOk()) return "zapi"
  return "evolution"
}

export interface SendResult {
  ok: boolean
  messageId: string | null
  attempts: number
  errorMsg: string | null
}

export async function sendText(whatsappId: string, text: string): Promise<SendResult> {
  if (activeProvider() === "zapi") {
    const r: ZapiSendResult = await sendZapiText(whatsappId, text)
    return r
  }
  const r: EvolutionSendResult = await sendEvolutionTextDetailed(whatsappId, text)
  return r
}

// Mais simples — quando só precisa saber se foi ou não.
export async function sendTextOk(whatsappId: string, text: string): Promise<boolean> {
  const r = await sendText(whatsappId, text)
  return r.ok
}

export async function getConnectionState(): Promise<EvolutionState> {
  if (activeProvider() === "zapi") return getZapiConnectionState()
  return getEvolutionConnectionState()
}

async function getEvolutionConnectionState(): Promise<EvolutionState> {
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) return "unknown"
  const res = await evolutionFetch(`${apiUrl}/instance/connectionState/${instance}`, {
    label: "evolution:state",
    headers: { apikey: apiKey },
    method: "GET",
    timeoutMs: 8_000,
    maxAttempts: 2,
  })
  if (!res.ok) return "unknown"
  const data = res.responseJson as { instance?: { state?: EvolutionState } } | null
  return (data?.instance?.state ?? "unknown") as EvolutionState
}

// ─── Envio de mídia (texto + arquivo) ────────────────────────────────────────
// Caller passa o filename salvo no nosso media storage; nós montamos a URL
// assinada pra Evolution/Z-API baixar.

export interface SendMediaArgs {
  whatsappId: string
  filename: string    // o que o saveMediaBuffer retornou
  mimetype: string
  caption?: string
  fileName?: string   // nome amigável pro destinatário
  rawBase64?: string  // fallback quando não temos APP_PUBLIC_URL
}

export async function sendMedia(args: SendMediaArgs): Promise<SendResult> {
  const provider = activeProvider()
  const publicBase = resolvePublicBaseUrl()
  const signed = signMediaUrl(args.filename, 300).queryString
  const url = publicBase
    ? `${publicBase}/api/media/${args.filename}?${signed}`
    : null

  if (provider === "zapi") {
    if (!url && !args.rawBase64) {
      return { ok: false, messageId: null, attempts: 0, errorMsg: "Sem APP_PUBLIC_URL nem base64 pra enviar mídia via Z-API" }
    }
    const r = await sendZapiMedia(args.whatsappId, {
      mediaUrlOrBase64: url ?? `data:${args.mimetype};base64,${args.rawBase64}`,
      mimetype: args.mimetype,
      caption: args.caption,
      fileName: args.fileName,
    })
    return r
  }

  // Evolution
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) {
    return { ok: false, messageId: null, attempts: 0, errorMsg: "Evolution env ausente" }
  }
  const number = args.whatsappId.endsWith("@g.us")
    ? args.whatsappId
    : args.whatsappId.replace(/@.*/, "")

  const media = url ?? args.rawBase64 ?? ""
  if (!media) {
    return { ok: false, messageId: null, attempts: 0, errorMsg: "Sem mídia (nem URL nem base64)" }
  }

  const res = await evolutionFetch(`${apiUrl}/message/sendMedia/${instance}`, {
    label: "evolution:send-media",
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({
      number,
      mediatype: args.mimetype.startsWith("image/") ? "image"
        : args.mimetype.startsWith("video/") ? "video"
        : args.mimetype.startsWith("audio/") ? "audio"
        : "document",
      mimetype: args.mimetype,
      caption: args.caption ?? "",
      media,
      fileName: args.fileName,
    }),
    timeoutMs: 30_000,
  })
  if (!res.ok) {
    return { ok: false, messageId: null, attempts: res.attempts, errorMsg: res.lastError ?? `status ${res.status}` }
  }
  const data = res.responseJson as { key?: { id?: string } } | null
  return { ok: true, messageId: data?.key?.id ?? null, attempts: res.attempts, errorMsg: null }
}

// ─── Outros ─────────────────────────────────────────────────────────────────

export async function fetchInboundMediaBase64(
  key: { id: string; remoteJid: string; fromMe: boolean },
): Promise<{ base64: string; mimetype?: string } | null> {
  // Z-API entrega base64 direto no webhook payload na maioria dos casos,
  // então quando provider=zapi a gente nunca chega aqui. Pra Evolution,
  // delegamos ao helper existente.
  if (activeProvider() === "zapi") return null
  return fetchEvolutionMediaBase64(key)
}

export async function validateNumberOnWhatsApp(whatsappId: string): Promise<boolean | null> {
  if (activeProvider() === "zapi") return zapiPhoneExists(whatsappId)
  // Evolution: skip (endpoint instável conforme versão). Retorna null = inconclusivo.
  return null
}

export async function getQrCode(): Promise<{ base64: string | null; connected: boolean }> {
  if (activeProvider() === "zapi") return getZapiQrCode()
  // Evolution: usa a rota existente /api/whatsapp/qrcode (que chama o helper).
  return { base64: null, connected: false }
}

export async function disconnectInstance(): Promise<boolean> {
  if (activeProvider() === "zapi") return disconnectZapi()
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME
  if (!apiUrl || !apiKey || !instance) return false
  const res = await evolutionFetch(`${apiUrl}/instance/logout/${instance}`, {
    label: "evolution:logout",
    method: "DELETE",
    headers: { apikey: apiKey },
    timeoutMs: 8_000,
    maxAttempts: 1,
  })
  return res.ok
}

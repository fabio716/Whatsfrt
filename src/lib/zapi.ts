// ═══════════════════════════════════════════════════════════════════════════
// Z-API adapter — chamadas REST para api.z-api.io.
//
// Z-API URL base: https://api.z-api.io/instances/{INSTANCE_ID}/token/{TOKEN}/{endpoint}
//
// Diferenças em relação ao Evolution:
//   - Endpoints flat (send-text, send-image, etc) sem "/message/" prefix
//   - Payload usa "phone" em vez de "number"; "message" em vez de "text"
//   - Conexão checada via /status (retorna { connected: true|false })
//   - Validação de número via /phone-exists/{phone}
//   - Reusa evolutionFetch (mesmo retry+backoff, timing-safe).
// ═══════════════════════════════════════════════════════════════════════════

import { evolutionFetch } from "@/lib/reliability/evolutionFetch"
import type { EvolutionState } from "@/lib/reliability/events"

const ZAPI_BASE = "https://api.z-api.io"

function envOk(): { instanceId: string; token: string; clientToken: string | undefined } | null {
  const instanceId = process.env.ZAPI_INSTANCE_ID
  const token = process.env.ZAPI_TOKEN
  const clientToken = process.env.ZAPI_CLIENT_TOKEN
  if (!instanceId || !token) return null
  return { instanceId, token, clientToken }
}

function buildUrl(endpoint: string): string | null {
  const cfg = envOk()
  if (!cfg) return null
  return `${ZAPI_BASE}/instances/${cfg.instanceId}/token/${cfg.token}/${endpoint}`
}

function commonHeaders(): Record<string, string> {
  const cfg = envOk()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (cfg?.clientToken) headers["Client-Token"] = cfg.clientToken
  return headers
}

// Normaliza WhatsApp ID para o formato Z-API. Z-API aceita o número puro
// "5511999999999" sem sufixo. Grupos vêm como "<id>@g.us" em ambos lados.
function normalizePhone(whatsappId: string): string {
  if (whatsappId.endsWith("@g.us")) return whatsappId
  return whatsappId.replace("@s.whatsapp.net", "").replace(/@.*$/, "")
}

// ─── Estado da conexão ───────────────────────────────────────────────────────

interface ZapiStatusResponse {
  connected?: boolean
  session?: string
  error?: string
}

export async function getZapiConnectionState(): Promise<EvolutionState> {
  const url = buildUrl("status")
  if (!url) return "unknown"

  const res = await evolutionFetch(url, {
    label: "zapi:status",
    headers: commonHeaders(),
    method: "GET",
    timeoutMs: 8_000,
    maxAttempts: 2,
  })
  if (!res.ok) return "unknown"
  const data = res.responseJson as ZapiStatusResponse | null
  if (!data) return "unknown"
  if (data.connected === true) return "open"
  if (data.connected === false) return "close"
  return "unknown"
}

// ─── Foto de perfil ──────────────────────────────────────────────────────────
// Busca a URL da foto de perfil de um contato na Z-API. Retorna null se o
// contato não tem foto pública ou se a chamada falhar.
export async function getZapiProfilePicture(whatsappId: string): Promise<string | null> {
  const phone = normalizePhone(whatsappId)
  const url = buildUrl(`profile-picture?phone=${encodeURIComponent(phone)}`)
  if (!url) {
    console.error("[zapi:profile-picture] ZAPI_INSTANCE_ID/ZAPI_TOKEN não configurados")
    return null
  }
  const res = await evolutionFetch(url, {
    label: "zapi:profile-picture",
    headers: commonHeaders(),
    method: "GET",
    timeoutMs: 8_000,
    maxAttempts: 1,
  })
  if (!res.ok) {
    console.error(`[zapi:profile-picture] falha para ${phone}: status=${res.status} body=${res.responseText?.slice(0, 300)}`)
    return null
  }
  const data = res.responseJson as { link?: string | null } | null
  const link = data?.link
  if (!link) {
    console.warn(`[zapi:profile-picture] sem link no retorno para ${phone}: ${res.responseText?.slice(0, 200)}`)
    return null
  }
  return link.startsWith("http") ? link : null
}

// ─── Envio de texto ──────────────────────────────────────────────────────────

export interface ZapiSendResult {
  ok: boolean
  messageId: string | null
  attempts: number
  errorMsg: string | null
}

export async function sendZapiText(
  whatsappId: string,
  message: string,
): Promise<ZapiSendResult> {
  const url = buildUrl("send-text")
  if (!url) return { ok: false, messageId: null, attempts: 0, errorMsg: "ZAPI_INSTANCE_ID/ZAPI_TOKEN ausente" }

  const res = await evolutionFetch(url, {
    label: "zapi:send-text",
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify({
      phone: normalizePhone(whatsappId),
      message,
    }),
  })
  if (!res.ok) {
    return { ok: false, messageId: null, attempts: res.attempts, errorMsg: res.lastError ?? `status ${res.status}` }
  }
  const data = res.responseJson as { messageId?: string; id?: string } | null
  return { ok: true, messageId: data?.messageId ?? data?.id ?? null, attempts: res.attempts, errorMsg: null }
}

// Edita uma mensagem de texto já enviada. Z-API reaproveita o /send-text com
// o campo editMessageId apontando pro messageId original. Só funciona dentro
// da janela que o WhatsApp permite editar (alguns minutos após o envio) —
// depois disso a Z-API retorna erro, que repassamos pro chamador.
export async function editZapiText(
  whatsappId: string,
  newMessage: string,
  editMessageId: string,
): Promise<ZapiSendResult> {
  const url = buildUrl("send-text")
  if (!url) return { ok: false, messageId: null, attempts: 0, errorMsg: "ZAPI_INSTANCE_ID/ZAPI_TOKEN ausente" }

  const res = await evolutionFetch(url, {
    label: "zapi:edit-text",
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify({
      phone: normalizePhone(whatsappId),
      message: newMessage,
      editMessageId,
    }),
  })
  if (!res.ok) {
    return { ok: false, messageId: null, attempts: res.attempts, errorMsg: res.lastError ?? `status ${res.status}` }
  }
  const data = res.responseJson as { messageId?: string; id?: string } | null
  return { ok: true, messageId: data?.messageId ?? data?.id ?? editMessageId, attempts: res.attempts, errorMsg: null }
}

// Apaga (pra todos) uma mensagem já enviada. Mesma janela de tempo do WhatsApp
// que a edição — passado esse prazo a Z-API recusa e repassamos o erro.
export interface ZapiDeleteResult {
  ok: boolean
  errorMsg: string | null
}

export async function deleteZapiMessage(
  whatsappId: string,
  messageId: string,
): Promise<ZapiDeleteResult> {
  const cfg = envOk()
  if (!cfg) return { ok: false, errorMsg: "ZAPI_INSTANCE_ID/ZAPI_TOKEN ausente" }
  const phone = normalizePhone(whatsappId)
  const url = buildUrl(
    `messages?messageId=${encodeURIComponent(messageId)}&phone=${encodeURIComponent(phone)}&owner=true`,
  )
  if (!url) return { ok: false, errorMsg: "ZAPI_INSTANCE_ID/ZAPI_TOKEN ausente" }

  const res = await evolutionFetch(url, {
    label: "zapi:delete-message",
    method: "DELETE",
    headers: commonHeaders(),
  })
  if (!res.ok) {
    return { ok: false, errorMsg: res.lastError ?? `status ${res.status}` }
  }
  return { ok: true, errorMsg: null }
}

// ─── Envio de mídia ──────────────────────────────────────────────────────────
// Z-API tem endpoints separados por tipo de mídia. Aceitam URL pública OU
// base64 no campo. Preferimos URL (mais robusto).

function pickMediaEndpoint(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "send-image"
  if (mimetype.startsWith("video/")) return "send-video"
  if (mimetype.startsWith("audio/")) return "send-audio"
  return "send-document"
}

// Extrai extensao (sem ponto) do fileName ou do mimetype.
// send-document da Z-API EXIGE esse campo pro cliente ver o icone/nome
// correto do arquivo. Sem ele, PDFs chegam como generic file ou falham.
function pickExtension(fileName: string | undefined, mimetype: string): string {
  if (fileName) {
    const dot = fileName.lastIndexOf(".")
    if (dot > 0 && dot < fileName.length - 1) {
      return fileName.slice(dot + 1).toLowerCase()
    }
  }
  // Fallback: derivar do mimetype (application/pdf -> pdf).
  const slash = mimetype.lastIndexOf("/")
  if (slash > -1) {
    const sub = mimetype.slice(slash + 1).toLowerCase()
    // Remove prefixos tipo 'x-' e sufixos com ';'.
    return sub.replace(/^x-/, "").split(";")[0].trim() || "bin"
  }
  return "bin"
}

export interface ZapiMediaOpts {
  mediaUrlOrBase64: string  // ex: "https://app/api/media/abc?token=..." ou "<base64>"
  mimetype: string
  caption?: string
  fileName?: string
}

export async function sendZapiMedia(
  whatsappId: string,
  opts: ZapiMediaOpts,
): Promise<ZapiSendResult> {
  const endpoint = pickMediaEndpoint(opts.mimetype)
  const url = buildUrl(endpoint)
  if (!url) return { ok: false, messageId: null, attempts: 0, errorMsg: "ZAPI envs ausentes" }

  // Documento requer path com extensao no endpoint (/send-document/{ext}) —
  // Z-API usa isso pra indexar o tipo. Falta desse segmento fazia PDF chegar
  // como arquivo generico ou nao chegar (funcionaria reportou 2026-07-06).
  const extension = pickExtension(opts.fileName, opts.mimetype)
  const finalUrl = endpoint === "send-document" ? `${url}/${extension}` : url

  // Campo específico por endpoint. Z-API espera "image"/"video"/"audio"/"document".
  const fieldName = endpoint === "send-image" ? "image"
    : endpoint === "send-video" ? "video"
    : endpoint === "send-audio" ? "audio"
    : "document"

  const body: Record<string, unknown> = {
    phone: normalizePhone(whatsappId),
    [fieldName]: opts.mediaUrlOrBase64,
  }
  if (opts.caption) body.caption = opts.caption
  if (opts.fileName) body.fileName = opts.fileName
  if (endpoint === "send-document") body.extension = extension

  const res = await evolutionFetch(finalUrl, {
    label: `zapi:${endpoint}`,
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify(body),
    timeoutMs: 30_000, // mídia pode demorar
  })
  if (!res.ok) {
    return { ok: false, messageId: null, attempts: res.attempts, errorMsg: res.lastError ?? `status ${res.status}` }
  }
  const data = res.responseJson as { messageId?: string; id?: string } | null
  return { ok: true, messageId: data?.messageId ?? data?.id ?? null, attempts: res.attempts, errorMsg: null }
}

// ─── Validação de número (anti-ban) ──────────────────────────────────────────

interface ZapiPhoneExistsResponse {
  exists?: boolean
}

export async function zapiPhoneExists(whatsappId: string): Promise<boolean | null> {
  const phone = normalizePhone(whatsappId)
  const url = buildUrl(`phone-exists/${phone}`)
  if (!url) return null

  const res = await evolutionFetch(url, {
    label: "zapi:phone-exists",
    method: "GET",
    headers: commonHeaders(),
    timeoutMs: 8_000,
    maxAttempts: 1, // não retry — validação é best-effort
  })
  if (!res.ok) return null
  const data = res.responseJson as ZapiPhoneExistsResponse | null
  if (data?.exists === true) return true
  if (data?.exists === false) return false
  return null
}

// ─── QR code para parear ─────────────────────────────────────────────────────

interface ZapiQrResponse {
  value?: string  // base64 do QR
  connected?: boolean
}

export async function getZapiQrCode(): Promise<{ base64: string | null; connected: boolean }> {
  const url = buildUrl("qr-code/image")
  if (!url) return { base64: null, connected: false }

  const res = await evolutionFetch(url, {
    label: "zapi:qr",
    method: "GET",
    headers: commonHeaders(),
    timeoutMs: 10_000,
    maxAttempts: 1,
  })
  if (!res.ok) return { base64: null, connected: false }
  const data = res.responseJson as ZapiQrResponse | null
  return {
    base64: data?.value ?? null,
    connected: !!data?.connected,
  }
}

// ─── Desconectar (logout) ────────────────────────────────────────────────────

export async function disconnectZapi(): Promise<boolean> {
  const url = buildUrl("disconnect")
  if (!url) return false
  const res = await evolutionFetch(url, {
    label: "zapi:disconnect",
    method: "GET",
    headers: commonHeaders(),
    timeoutMs: 8_000,
    maxAttempts: 1,
  })
  return res.ok
}

// ─── Marca contato como "digitando" (UX humana, reduz risco de ban) ─────────

export async function sendZapiTyping(whatsappId: string, durationMs: number = 3000): Promise<void> {
  const url = buildUrl("send-chat-state")
  if (!url) return
  await evolutionFetch(url, {
    label: "zapi:typing",
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify({
      phone: normalizePhone(whatsappId),
      action: "composing",
      duration: Math.min(durationMs, 10000),
    }),
    timeoutMs: 5_000,
    maxAttempts: 1,
  })
}

export function isZapiEnvOk(): boolean {
  return envOk() !== null
}

// ═══════════════════════════════════════════════════════════════════════════
// evolutionFetch — wrapper de fetch com retry + backoff exponencial.
//
// Retry: 5xx, 429, network errors (ECONNRESET, timeout, etc).
// NÃO retry: 4xx semânticos (400/401/403/404) — falha real.
// Backoff: 1s → 3s → 9s. Cap em 3 tentativas (1 + 2 retries).
// Respeita Retry-After se a Evolution mandar.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_ATTEMPTS = 3
const BASE_DELAY_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function shouldRetry(status: number | null): boolean {
  if (status === null) return true // network error
  if (status === 429) return true
  if (status >= 500 && status < 600) return true
  return false
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const secs = Number.parseInt(header, 10)
  if (Number.isFinite(secs) && secs > 0) return Math.min(secs, 30) * 1000
  return null
}

export interface EvolutionFetchOptions extends RequestInit {
  // Identificador para logs (ex: "send-text", "send-media").
  label?: string
  // Limite de tentativas (default 3).
  maxAttempts?: number
  // Timeout por tentativa (default 15s).
  timeoutMs?: number
}

export interface EvolutionFetchResult {
  ok: boolean
  status: number | null
  responseText: string | null
  responseJson: unknown
  attempts: number
  lastError?: string
}

export async function evolutionFetch(
  url: string,
  options: EvolutionFetchOptions = {},
): Promise<EvolutionFetchResult> {
  const {
    label = "evolution",
    maxAttempts = MAX_ATTEMPTS,
    timeoutMs = 15_000,
    ...init
  } = options

  let attempt = 0
  let lastStatus: number | null = null
  let lastError: string | undefined
  let lastText: string | null = null

  while (attempt < maxAttempts) {
    attempt += 1
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timer)
      lastStatus = res.status

      if (res.ok) {
        let json: unknown = null
        const text = await res.text()
        lastText = text
        try { json = text ? JSON.parse(text) : null } catch { /* não-JSON ok */ }
        return {
          ok: true, status: res.status,
          responseText: text, responseJson: json, attempts: attempt,
        }
      }

      // Não-OK
      const text = await res.text()
      lastText = text

      if (!shouldRetry(res.status) || attempt >= maxAttempts) {
        return {
          ok: false, status: res.status,
          responseText: text, responseJson: null, attempts: attempt,
          lastError: `${res.status} ${text.slice(0, 200)}`,
        }
      }

      const retryAfter = parseRetryAfter(res.headers.get("retry-after"))
      const delay = retryAfter ?? BASE_DELAY_MS * Math.pow(3, attempt - 1)
      console.warn(`[evolutionFetch:${label}] tentativa ${attempt}/${maxAttempts} falhou (${res.status}), retry em ${delay}ms`)
      await sleep(delay)
    } catch (err) {
      clearTimeout(timer)
      lastError = err instanceof Error ? err.message : String(err)
      lastStatus = null
      if (attempt >= maxAttempts) {
        return {
          ok: false, status: null,
          responseText: lastText, responseJson: null,
          attempts: attempt, lastError,
        }
      }
      const delay = BASE_DELAY_MS * Math.pow(3, attempt - 1)
      console.warn(`[evolutionFetch:${label}] tentativa ${attempt}/${maxAttempts} erro de rede (${lastError}), retry em ${delay}ms`)
      await sleep(delay)
    }
  }

  return {
    ok: false, status: lastStatus,
    responseText: lastText, responseJson: null,
    attempts: attempt, lastError,
  }
}

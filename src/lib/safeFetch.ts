// ═══════════════════════════════════════════════════════════════════════════
// Safe outbound fetch — protege contra SSRF quando a URL vem de fonte
// não totalmente confiável (ex: payload de webhook do Z-API/Evolution).
//
// Bloqueia:
//   • localhost / 127.0.0.0/8
//   • Ranges privados (10.x, 172.16-31.x, 192.168.x)
//   • Link-local (169.254.x — AWS/GCP metadata, infame em SSRF)
//   • IPv6 loopback (::1) e link-local (fe80::)
//   • Protocolos não-HTTP/S (file://, gopher://, ftp://)
// ═══════════════════════════════════════════════════════════════════════════

const PRIVATE_HOST_REGEX =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i

export function isPublicUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }

  if (!["http:", "https:"].includes(u.protocol)) return false
  if (!u.hostname) return false
  if (PRIVATE_HOST_REGEX.test(u.hostname)) return false

  // IPv4 numerica disfarcada (0177.0.0.1 = 127.0.0.1 em octal). Rejeita
  // qualquer hostname que comece com "0" e contenha pontos numericos.
  if (/^0/.test(u.hostname) && /\d+\.\d+\.\d+\.\d+/.test(u.hostname)) return false

  return true
}

// Wrapper de fetch que valida a URL antes de chamar. Retorna null em qualquer
// erro (URL bloqueada, timeout, status nao OK) pra simplificar uso em
// pipelines de download de midia.
export async function safeFetchBuffer(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Buffer | null> {
  if (!isPublicUrl(url)) {
    console.warn(`[safeFetch] URL bloqueada (SSRF guard): ${url.slice(0, 120)}`)
    return null
  }

  const timeoutMs = opts.timeoutMs ?? 30_000
  const maxBytes = opts.maxBytes ?? 100 * 1024 * 1024 // 100MB default

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null

    const len = res.headers.get("content-length")
    if (len && Number(len) > maxBytes) {
      console.warn(`[safeFetch] arquivo excede limite: ${len} > ${maxBytes}`)
      return null
    }

    const arr = await res.arrayBuffer()
    if (arr.byteLength > maxBytes) return null
    return Buffer.from(arr)
  } catch (err) {
    console.error("[safeFetch] download falhou:", err instanceof Error ? err.message : err)
    return null
  }
}

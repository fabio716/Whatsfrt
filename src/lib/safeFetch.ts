// ═══════════════════════════════════════════════════════════════════════════
// Safe outbound fetch — protege contra SSRF quando a URL vem de fonte
// não totalmente confiável (ex: payload de webhook do Z-API/Evolution).
//
// A versão anterior só olhava o TEXTO do endereço com uma regex: deixava
// passar IPv6 entre colchetes ("[::1]"), nome de domínio que aponta pra IP
// interno, e seguia redirecionamento pra rede interna.
//
// Agora:
//   • só http/https;
//   • o endereço é checado no momento da CONEXÃO (lookup próprio): todo IP
//     que o nome resolve precisa ser público — IPv4 e IPv6, inclusive IPv4
//     embutido em IPv6. A conexão usa exatamente o IP checado, então trocar
//     o DNS entre a checagem e a conexão (DNS rebinding) não funciona;
//   • redirecionamento seguido à mão, no máximo 3, cada um checado de novo;
//   • tamanho controlado enquanto baixa (para no limite, não depois).
// ═══════════════════════════════════════════════════════════════════════════

import http from "node:http"
import https from "node:https"
import dns from "node:dns"
import net from "node:net"

const BLOQUEADOS = new net.BlockList()
const REDES_V4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
]
const REDES_V6: [string, number][] = [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
  ["64:ff9b::", 96], ["2001:db8::", 32],
]
for (const [rede, bits] of REDES_V4) BLOQUEADOS.addSubnet(rede, bits, "ipv4")
for (const [rede, bits] of REDES_V6) BLOQUEADOS.addSubnet(rede, bits, "ipv6")

export function ipPrivado(ip: string): boolean {
  const tipo = net.isIP(ip)
  if (tipo === 4) return BLOQUEADOS.check(ip, "ipv4")
  if (tipo === 6) {
    // IPv4 embutido em IPv6 (::ffff:127.0.0.1) — checa como IPv4.
    const m = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (m) return BLOQUEADOS.check(m[1], "ipv4")
    if (ip.toLowerCase().startsWith("::ffff:")) return true
    return BLOQUEADOS.check(ip, "ipv6")
  }
  return true
}

// Checagem rápida só do texto (sem DNS). A proteção de verdade é o lookup
// feito na hora da conexão (lookupSeguro).
export function isPublicUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (!["http:", "https:"].includes(u.protocol)) return false
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!host || host === "localhost" || host.endsWith(".localhost")) return false
  if (net.isIP(host) && ipPrivado(host)) return false
  return true
}

type CallbackLookup = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void

// Lookup usado na conexão: resolve o nome e recusa se QUALQUER IP for interno.
function lookupSeguro(hostname: string, opts: dns.LookupOptions, cb: CallbackLookup): void {
  dns.lookup(hostname, { all: true }, (err, enderecos) => {
    if (err) return cb(err, "", 0)
    const lista = enderecos as dns.LookupAddress[]
    if (lista.length === 0 || lista.some((e) => ipPrivado(e.address))) {
      const erro: NodeJS.ErrnoException = new Error(`endereço interno bloqueado (${hostname})`)
      erro.code = "ESSRF"
      return cb(erro, "", 0)
    }
    if (opts.all) return cb(null, lista)
    cb(null, lista[0].address, lista[0].family)
  })
}

type Resposta = { status: number; location?: string; corpo?: Buffer }

function baixar(url: URL, timeoutMs: number, maxBytes: number): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http
    const req = mod.get(url, { lookup: lookupSeguro as unknown as typeof dns.lookup, timeout: timeoutMs }, (res) => {
      const status = res.statusCode ?? 0
      if (status >= 300 && status < 400) {
        res.resume()
        return resolve({ status, location: res.headers.location })
      }
      if (status < 200 || status >= 300) {
        res.resume()
        return resolve({ status })
      }
      const declarado = Number(res.headers["content-length"] ?? 0)
      if (declarado > maxBytes) {
        res.destroy()
        return reject(new Error(`arquivo excede limite: ${declarado} > ${maxBytes}`))
      }
      const partes: Buffer[] = []
      let total = 0
      res.on("data", (c: Buffer) => {
        total += c.length
        if (total > maxBytes) {
          res.destroy()
          return reject(new Error(`arquivo excede limite: > ${maxBytes}`))
        }
        partes.push(c)
      })
      res.on("end", () => resolve({ status, corpo: Buffer.concat(partes) }))
      res.on("error", reject)
    })
    // Tempo total (não só ociosidade), igual ao AbortSignal.timeout de antes.
    const relogio = setTimeout(() => req.destroy(new Error("tempo esgotado")), timeoutMs)
    req.on("close", () => clearTimeout(relogio))
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")))
    req.on("error", reject)
  })
}

// Retorna null em qualquer erro (URL bloqueada, timeout, status não OK) pra
// simplificar uso em pipelines de download de mídia.
export async function safeFetchBuffer(
  url: string,
  opts: { timeoutMs?: number; maxBytes?: number } = {},
): Promise<Buffer | null> {
  const timeoutMs = opts.timeoutMs ?? 30_000
  const maxBytes = opts.maxBytes ?? 100 * 1024 * 1024 // 100MB default

  let atual = url
  for (let salto = 0; salto <= 3; salto++) {
    if (!isPublicUrl(atual)) {
      console.warn(`[safeFetch] URL bloqueada (SSRF guard): ${atual.slice(0, 120)}`)
      return null
    }
    try {
      const r = await baixar(new URL(atual), timeoutMs, maxBytes)
      if (r.location) {
        atual = new URL(r.location, atual).toString()
        continue
      }
      return r.corpo ?? null
    } catch (err) {
      console.error("[safeFetch] download falhou:", err instanceof Error ? err.message : err)
      return null
    }
  }
  console.warn("[safeFetch] redirecionamentos demais")
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Voz do mascote (ElevenLabs). Gera o áudio no servidor — a chave fica só em
// variável de ambiente, nunca vai para o navegador. Falas repetidas ficam em
// cache no Redis (30 dias), então cada frase é cobrada uma vez só.
//
// Variáveis: ELEVENLABS_API_KEY (obrigatória), ELEVENLABS_VOICE_ID (opcional).
// Sem a chave, devolve null e quem chamou usa a voz do navegador.
// ═══════════════════════════════════════════════════════════════════════════
import { createHash } from "node:crypto"
import { redis } from "@/lib/redis"

const VOZ_PADRAO = "21m00Tcm4TlvDq8ikWAM"
const MAX_CARACTERES = 220
const TRINTA_DIAS = 30 * 24 * 60 * 60

export function vozConfigurada(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY)
}

// Tira emoji e espaços repetidos — a voz não deve "ler" figurinhas.
export function limparFala(texto: string): string {
  return texto.replace(/[\p{Extended_Pictographic}‍️]/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_CARACTERES)
}

export async function sintetizarVoz(texto: string): Promise<Buffer | null> {
  const chave = process.env.ELEVENLABS_API_KEY
  const limpo = limparFala(texto)
  if (!chave || !limpo) return null

  const voz = process.env.ELEVENLABS_VOICE_ID || VOZ_PADRAO
  const cacheKey = `voz:mascote:${createHash("sha256").update(`${voz}|${limpo}`).digest("hex").slice(0, 32)}`
  const guardado = await redis.get(cacheKey)
  if (guardado) return Buffer.from(guardado, "base64")

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_64`, {
      method: "POST",
      signal: AbortSignal.timeout(20_000),
      headers: { "xi-api-key": chave, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: limpo,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35 },
      }),
    })
    if (!r.ok) {
      console.error(`[vozMascote] ElevenLabs respondeu ${r.status}`)
      return null
    }
    const audio = Buffer.from(await r.arrayBuffer())
    if (audio.length < 500) return null
    await redis.set(cacheKey, audio.toString("base64"))
    await redis.expire(cacheKey, TRINTA_DIAS)
    return audio
  } catch (err) {
    console.error("[vozMascote] falha:", err instanceof Error ? err.message : err)
    return null
  }
}

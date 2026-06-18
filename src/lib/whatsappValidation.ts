// ═══════════════════════════════════════════════════════════════════════════
// Validação de número no WhatsApp com cache Redis (7 dias).
//
// Por que cache? Cada chamada Z-API /phone-exists consome quota e demora
// 200-500ms. Como o resultado raramente muda (cliente raramente "sai" do
// WhatsApp), cachear por uma semana evita centenas de chamadas redundantes
// e dá resposta instantânea ao agente.
// ═══════════════════════════════════════════════════════════════════════════

import { redis } from "@/lib/redis"
import { validateNumberOnWhatsApp } from "@/lib/whatsapp"

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 dias

// Retorna:
//   true  → número existe no WhatsApp (mensagens entregues)
//   false → número NÃO existe (mensagens nunca chegam)
//   null  → não foi possível verificar (provider indisponível, sem suporte etc)
export async function validatePhoneCached(whatsappId: string): Promise<boolean | null> {
  const phone = whatsappId.replace("@s.whatsapp.net", "").replace(/@.*/, "")
  if (!phone) return null

  const cacheKey = `wa:validated:${phone}`

  // 1. Cache hit?
  const cached = await redis.get(cacheKey)
  if (cached === "true") return true
  if (cached === "false") return false

  // 2. Miss: consulta provedor
  const result = await validateNumberOnWhatsApp(whatsappId)
  if (result === true) {
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, "true")
  } else if (result === false) {
    // Cache "false" por menos tempo (1 dia) — talvez o cliente entre no WhatsApp
    await redis.setex(cacheKey, 24 * 60 * 60, "false")
  }
  // result null: não cacheia, tenta de novo na próxima
  return result
}

// Invalida o cache pra um número específico — usar quando agente confirmou
// manualmente que o número agora funciona (ex: cliente recadastrou no WA).
export async function invalidatePhoneCache(whatsappId: string): Promise<void> {
  const phone = whatsappId.replace("@s.whatsapp.net", "").replace(/@.*/, "")
  if (!phone) return
  await redis.del(`wa:validated:${phone}`)
}

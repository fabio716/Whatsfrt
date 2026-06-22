import { redis } from "@/lib/redis"

// Rate limiter por janela fixa. Usa Redis INCR + EXPIRE: na primeira chamada
// da janela, criamos o counter e setamos TTL; nas seguintes, só INCR. Redis
// gira a chave sozinho quando o TTL expira.
//
// Fail-open: se Redis estiver caído, deixa passar — o anti-spam diário
// (Postgres) ainda cobre o caso de abuso prolongado.
export interface RateCheck {
  allowed: boolean
  count: number
  limit: number
  windowSec: number
  retryAfterSec: number  // 0 quando allowed=true
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateCheck> {
  const count = await redis.incr(key)
  if (count === 0) {
    // Redis offline — fail-open, log já saiu de dentro do safeExecute
    return { allowed: true, count: 0, limit, windowSec, retryAfterSec: 0 }
  }
  if (count === 1) {
    await redis.expire(key, windowSec)
  }
  if (count > limit) {
    return { allowed: false, count, limit, windowSec, retryAfterSec: windowSec }
  }
  return { allowed: true, count, limit, windowSec, retryAfterSec: 0 }
}

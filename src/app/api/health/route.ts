// ═══════════════════════════════════════════════════════════════════════════
// /api/health — status agregado de todas as dependências críticas.
//
// Retorna 200 se TUDO está OK; 503 se qualquer dependência crítica está fora.
// Estrutura pensada para Docker healthcheck e dashboards externos.
//
// Não exige autenticação — usado por nginx, orquestrador e operador
// rapidamente verificar o sistema. Não expõe segredos.
// ═══════════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { getWatchdogStatus } from "@/lib/reliability/watchdog"
import { queueStats } from "@/lib/reliability/queue"
import { activeProvider } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

type Check = { ok: boolean; latencyMs?: number; detail?: string }

async function checkDb(): Promise<Check> {
  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "db error" }
  }
}

async function checkRedis(): Promise<Check> {
  const t0 = Date.now()
  const pong = await redis.ping()
  return pong === "PONG"
    ? { ok: true, latencyMs: Date.now() - t0 }
    : { ok: false, detail: "ping falhou" }
}

export async function GET(): Promise<NextResponse> {
  const [db, redisCheck, q] = await Promise.all([checkDb(), checkRedis(), queueStats()])
  const wd = getWatchdogStatus()
  const provedor = activeProvider()

  // "close" = o provedor RESPONDEU que está desconectado. Aí sim é grave:
  // mensagem de cliente não entra nem sai.
  //
  // "unknown" NÃO reprova. Significa "não conseguimos perguntar" (timeout,
  // rede, a API do provedor fora do ar) — coisa diferente de estar
  // desconectado. Antes os dois derrubavam a saúde, e o efeito era ruim de
  // dois jeitos: o container ficava marcado como doente para sempre depois de
  // uma única consulta falha, o deploy.sh esperava uma saúde que não voltava
  // (foi o que travou o deploy de 25/09 em 503) e o monitor.sh mandava alerta
  // de "fora do ar" com o sistema funcionando. Desconexão real continua sendo
  // pega: o monitor.sh consulta o status do provedor direto, por fora daqui.
  const whatsappOk = wd.state !== "close"

  const allOk = db.ok && redisCheck.ok && whatsappOk
  const body = {
    // "degraded" = alguma coisa está fora. "ok com ressalva" = tudo
    // respondendo, mas não conseguimos confirmar o WhatsApp agora.
    status: allOk ? (wd.state === "open" || wd.state === null ? "ok" : "ok-com-ressalva") : "degraded",
    timestamp: new Date().toISOString(),
    checks: {
      db,
      redis: redisCheck,
      // O nome do campo segue o provedor REALMENTE em uso (zapi ou evolution).
      // Antes era sempre "evolution", o que fazia parecer que o sistema estava
      // checando um provedor que a FRT não usa mais.
      whatsapp: {
        ok: whatsappOk,
        provider: provedor,
        state: wd.state ?? "unknown",
        lastCheckAt: wd.lastCheckAt,
      },
    },
    queue: q,
  }

  return NextResponse.json(body, { status: allOk ? 200 : 503 })
}

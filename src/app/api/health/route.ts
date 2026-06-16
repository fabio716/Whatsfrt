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

  // Evolution só é "crítica" se já tivermos pelo menos uma leitura do
  // watchdog e ela não estiver em "open". Se nunca foi checada, marcamos como
  // unknown (não bloqueia o health) — evita 503 logo no primeiro segundo.
  const evolutionOk = wd.state === null ? true : wd.state === "open"

  const allOk = db.ok && redisCheck.ok && evolutionOk
  const body = {
    status: allOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    checks: {
      db,
      redis: redisCheck,
      evolution: {
        ok: evolutionOk,
        state: wd.state ?? "unknown",
        lastCheckAt: wd.lastCheckAt,
      },
    },
    queue: q,
  }

  return NextResponse.json(body, { status: allOk ? 200 : 503 })
}

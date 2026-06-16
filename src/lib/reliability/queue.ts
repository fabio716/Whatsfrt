// ═══════════════════════════════════════════════════════════════════════════
// Fila durável para processamento de webhooks inbound (URA + side-effects).
//
// Por que: o handler antigo usava `setImmediate(() => UraStateMachine.process)`
// — fire-and-forget. Se o container reiniciasse no meio, a mensagem do cliente
// sumia silenciosamente. Aqui:
//
//   1. Webhook persiste o payload no Redis (LPUSH inbound) e devolve 200 OK
//   2. Worker dedicado faz BLMOVE inbound → processing (atômico)
//   3. Worker processa
//   4. Worker faz LREM processing (commit)
//   5. Se processo morre em (3): no boot seguinte, replayPending() move tudo
//      de processing → inbound de novo. Job é retentado.
//
// Idempotência: cada job carrega o key.id da Evolution. O handler de URA
// confere `Message.whatsappKeyId` antes de aplicar side-effects.
// ═══════════════════════════════════════════════════════════════════════════

import { redis, createDedicatedRedis } from "@/lib/redis"
import type Redis from "ioredis"

const INBOUND_KEY = "whatsfrt:queue:inbound"
const PROCESSING_KEY = "whatsfrt:queue:processing"
const POLL_TIMEOUT_SECONDS = 5

export interface InboundJob {
  // ID único do job (usado para LREM após sucesso)
  jobId: string
  // Identificador da mensagem na Evolution — usado para dedupe
  whatsappKeyId: string
  // Dados mínimos para a URA processar
  whatsappId: string
  messageText: string
  contactName: string
  // Para reaper / debug
  enqueuedAt: string
  attempts: number
}

export async function enqueueInbound(job: Omit<InboundJob, "enqueuedAt" | "attempts" | "jobId">): Promise<boolean> {
  const full: InboundJob = {
    ...job,
    jobId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  }
  const n = await redis.lpush(INBOUND_KEY, JSON.stringify(full))
  return n > 0
}

// ─── Worker ──────────────────────────────────────────────────────────────────

let workerActive = false
let dedicatedClient: Redis | null = null

type JobHandler = (job: InboundJob) => Promise<void>

async function processWithHandler(
  raw: string,
  handler: JobHandler,
): Promise<void> {
  let job: InboundJob
  try {
    job = JSON.parse(raw) as InboundJob
  } catch (err) {
    console.error("[queue] payload inválido descartado:", err, raw.slice(0, 200))
    await redis.lrem(PROCESSING_KEY, 1, raw)
    return
  }

  try {
    job.attempts += 1
    await handler(job)
    await redis.lrem(PROCESSING_KEY, 1, raw)
  } catch (err) {
    console.error(`[queue] job ${job.jobId} falhou (tentativa ${job.attempts}):`, err)
    // Se já tentou 3 vezes, manda para dead-letter (log loud + remove).
    if (job.attempts >= 3) {
      console.error(`[queue] DEAD LETTER ${job.jobId}: ${JSON.stringify(job)}`)
      await redis.lrem(PROCESSING_KEY, 1, raw)
      await redis.lpush("whatsfrt:queue:dead", raw)
      return
    }
    // Devolve pra inbound com contador incrementado.
    await redis.lrem(PROCESSING_KEY, 1, raw)
    await redis.lpush(INBOUND_KEY, JSON.stringify(job))
  }
}

async function workerLoop(handler: JobHandler): Promise<void> {
  if (!dedicatedClient) return
  while (workerActive) {
    try {
      // BLMOVE: bloqueia até POLL_TIMEOUT_SECONDS esperando um item.
      // Move RIGHT (final) de inbound para LEFT (início) de processing — atômico.
      const raw = await dedicatedClient.blmove(
        INBOUND_KEY,
        PROCESSING_KEY,
        "RIGHT",
        "LEFT",
        POLL_TIMEOUT_SECONDS,
      )
      if (!raw) continue // timeout — só recomeça o loop
      await processWithHandler(raw, handler)
    } catch (err) {
      console.error("[queue] worker loop erro:", err)
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
}

export function startInboundWorker(handler: JobHandler): void {
  if (workerActive) return
  workerActive = true
  dedicatedClient = createDedicatedRedis()
  dedicatedClient.on("error", (err) => console.error("[queue] redis dedicado erro:", err.message))
  void workerLoop(handler)
  console.log("[queue] worker iniciado")
}

export async function stopInboundWorker(): Promise<void> {
  workerActive = false
  if (dedicatedClient) {
    try { await dedicatedClient.quit() } catch { /* ok */ }
    dedicatedClient = null
  }
}

// Boot: tudo que estava em processing veio de uma execução anterior que morreu
// no meio. Devolve pra inbound para ser retentado.
export async function replayProcessingOnBoot(): Promise<number> {
  const n = await redis.drainProcessing(PROCESSING_KEY, INBOUND_KEY)
  if (n > 0) console.warn(`[queue] BOOT REPLAY: ${n} job(s) reenfileirado(s) do processing`)
  return n
}

export async function queueStats(): Promise<{
  inbound: number
  processing: number
  dead: number
}> {
  const [inbound, processing, dead] = await Promise.all([
    redis.llen(INBOUND_KEY),
    redis.llen(PROCESSING_KEY),
    redis.llen("whatsfrt:queue:dead"),
  ])
  return { inbound, processing, dead }
}

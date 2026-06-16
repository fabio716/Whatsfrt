// ═══════════════════════════════════════════════════════════════════════════
// Bootstrap dos workers de reliability. Chamado uma vez por processo via
// src/instrumentation.ts (Next.js).
//
// Ordem importa:
//   1. Boot replay: tira jobs travados em processing → inbound. Mensagens
//      que ficaram em voo na execução anterior são retentadas ANTES de
//      qualquer novo trabalho.
//   2. Worker: começa a drenar inbound.
//   3. Watchdog: começa a vigiar o Evolution.
//   4. Reaper: começa a marcar PENDING travadas como FAILED.
// ═══════════════════════════════════════════════════════════════════════════

import { replayProcessingOnBoot, startInboundWorker } from "./queue"
import { startWatchdog } from "./watchdog"
import { startReaper } from "./reaper"
import { handleInboundJob } from "./inboundHandler"

let started = false

export async function startReliabilityWorkers(): Promise<void> {
  if (started) return // idempotente (hot reload em dev)
  started = true

  console.log("[reliability] iniciando workers…")

  try {
    await replayProcessingOnBoot()
  } catch (err) {
    console.error("[reliability] replay falhou:", err)
  }

  startInboundWorker(handleInboundJob)
  startWatchdog()
  startReaper()

  console.log("[reliability] todos os workers ativos")
}

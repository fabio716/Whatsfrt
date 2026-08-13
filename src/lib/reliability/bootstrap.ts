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
import { startServiceReaper } from "./serviceReaper"
import { startCampaignResumer } from "./campaignResumer"
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
  startCampaignResumer()

  // Service reaper (auto-encerrar atendimentos e pedidos de nota) esta
  // DESLIGADO por default. Motivo: em 2026-07-06 varias agentes reportaram
  // que conversas em andamento sumiam da tela de repente — porque o reaper
  // encerrava sessoes com >30min sem msg mesmo estando ativas, e o painel
  // do agente filtra por assignedUserId (que o reaper zerava).
  // Politica atual: agente encerra manualmente com o botao 'Encerrar
  // atendimento'. Nada some sozinho. Historico preservado.
  // Pra reativar: SERVICE_REAPER=on no .env.
  if (process.env.SERVICE_REAPER === "on") {
    startServiceReaper()
    console.log("[reliability] service reaper LIGADO (SERVICE_REAPER=on)")
  } else {
    console.log("[reliability] service reaper DESLIGADO (agente encerra manual)")
  }

  console.log("[reliability] todos os workers ativos")
}

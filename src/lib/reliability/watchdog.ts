// ═══════════════════════════════════════════════════════════════════════════
// Watchdog do Evolution — pinga connectionState a cada 30s.
// Se state !== "open" → tenta /instance/connect, broadcasts SSE pro UI,
// loga CRITICAL pra o operador ver em monitor de logs.
// ═══════════════════════════════════════════════════════════════════════════

import { evolutionFetch } from "./evolutionFetch"
import { emitConnectionStateChange, type EvolutionState } from "./events"

const POLL_INTERVAL_MS = 30_000
const RECONNECT_BACKOFF_MS = 60_000 // não tenta reconectar mais que 1x/min

let timer: ReturnType<typeof setInterval> | null = null
let lastState: EvolutionState | null = null
let lastReconnectAttempt = 0
let lastCheckAt: Date | null = null

function envOk(): boolean {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE_NAME)
}

interface EvolutionStateResponse {
  instance?: { instanceName?: string; state?: EvolutionState }
}

async function checkConnectionState(): Promise<EvolutionState> {
  if (!envOk()) return "unknown"
  const url = `${process.env.EVOLUTION_API_URL}/instance/connectionState/${process.env.EVOLUTION_INSTANCE_NAME}`
  const res = await evolutionFetch(url, {
    label: "watchdog:state",
    headers: { apikey: process.env.EVOLUTION_API_KEY! },
    method: "GET",
    timeoutMs: 8_000,
    maxAttempts: 2,
  })
  if (!res.ok) return "unknown"
  const data = res.responseJson as EvolutionStateResponse | null
  return (data?.instance?.state ?? "unknown") as EvolutionState
}

async function tryReconnect(): Promise<void> {
  const now = Date.now()
  if (now - lastReconnectAttempt < RECONNECT_BACKOFF_MS) return
  lastReconnectAttempt = now
  if (!envOk()) return
  const url = `${process.env.EVOLUTION_API_URL}/instance/connect/${process.env.EVOLUTION_INSTANCE_NAME}`
  await evolutionFetch(url, {
    label: "watchdog:reconnect",
    headers: { apikey: process.env.EVOLUTION_API_KEY! },
    method: "GET",
    timeoutMs: 10_000,
    maxAttempts: 1,
  })
  console.warn("[watchdog] tentou /instance/connect — verifique o QR se necessário")
}

async function tick(): Promise<void> {
  try {
    const state = await checkConnectionState()
    lastCheckAt = new Date()

    if (state !== lastState) {
      console.warn(`[watchdog] estado Evolution: ${lastState ?? "?"} → ${state}`)
      lastState = state
      emitConnectionStateChange(state)
    }

    if (state !== "open") {
      console.error(`[watchdog] CRITICAL — Evolution NÃO está em "open" (state=${state}). Mensagens podem estar sendo perdidas.`)
      void tryReconnect()
    }
  } catch (err) {
    console.error("[watchdog] tick error:", err)
  }
}

export function startWatchdog(): void {
  if (timer) return // idempotente
  // Tick inicial sem esperar 30s.
  void tick()
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  console.log("[watchdog] iniciado (poll a cada 30s)")
}

export function stopWatchdog(): void {
  if (timer) clearInterval(timer)
  timer = null
}

export function getWatchdogStatus(): {
  state: EvolutionState | null
  lastCheckAt: string | null
} {
  return {
    state: lastState,
    lastCheckAt: lastCheckAt ? lastCheckAt.toISOString() : null,
  }
}

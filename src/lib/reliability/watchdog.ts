// ═══════════════════════════════════════════════════════════════════════════
// Watchdog do Evolution — pinga connectionState a cada 30s.
// Se state !== "open" → tenta /instance/connect, broadcasts SSE pro UI,
// loga CRITICAL pra o operador ver em monitor de logs.
//
// Estado é mantido em globalThis via Symbol.for porque, em Next.js standalone,
// instrumentation.ts (que roda o watchdog) e os route handlers (que leem via
// getWatchdogStatus) podem ser bundles separados — module-level vars NÃO são
// compartilhadas. Sem isso, /api/health vê lastCheckAt=null mesmo com o
// watchdog tickando perfeitamente.
// ═══════════════════════════════════════════════════════════════════════════

import { evolutionFetch } from "./evolutionFetch"
import { emitConnectionStateChange, type EvolutionState } from "./events"
import { activeProvider } from "@/lib/whatsapp"
import { getZapiConnectionState } from "@/lib/zapi"

const POLL_INTERVAL_MS = 30_000
const RECONNECT_BACKOFF_MS = 60_000 // não tenta reconectar mais que 1x/min

const STATE_KEY = Symbol.for("whatsfrt.reliability.watchdog.state")

interface SharedState {
  timer: ReturnType<typeof setInterval> | null
  lastState: EvolutionState | null
  lastReconnectAttempt: number
  lastCheckAt: Date | null
}

type GlobalWithSlot = typeof globalThis & {
  [STATE_KEY]?: SharedState
}

function state(): SharedState {
  const g = globalThis as GlobalWithSlot
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      timer: null,
      lastState: null,
      lastReconnectAttempt: 0,
      lastCheckAt: null,
    }
  }
  return g[STATE_KEY]
}

function envOk(): boolean {
  return !!(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE_NAME)
}

interface EvolutionStateResponse {
  instance?: { instanceName?: string; state?: EvolutionState }
}

async function checkConnectionState(): Promise<EvolutionState> {
  if (activeProvider() === "zapi") return getZapiConnectionState()

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
  const s = state()
  const now = Date.now()
  if (now - s.lastReconnectAttempt < RECONNECT_BACKOFF_MS) return
  s.lastReconnectAttempt = now

  // Z-API: não tentamos auto-reconectar — o painel deles gerencia. Apenas log.
  if (activeProvider() === "zapi") {
    console.warn("[watchdog] Z-API fora de open — verifique o painel z-api.io")
    return
  }

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
  const s = state()
  try {
    const detected = await checkConnectionState()
    s.lastCheckAt = new Date()

    if (detected !== s.lastState) {
      console.warn(`[watchdog] estado Evolution: ${s.lastState ?? "?"} → ${detected}`)
      s.lastState = detected
      emitConnectionStateChange(detected)
    }

    if (detected !== "open") {
      console.error(`[watchdog] CRITICAL — Evolution NÃO está em "open" (state=${detected}). Mensagens podem estar sendo perdidas.`)
      void tryReconnect()
    }
  } catch (err) {
    console.error("[watchdog] tick error:", err)
  }
}

export function startWatchdog(): void {
  const s = state()
  if (s.timer) return // idempotente
  // Tick inicial sem esperar 30s.
  void tick()
  s.timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
  console.log("[watchdog] iniciado (poll a cada 30s)")
}

export function stopWatchdog(): void {
  const s = state()
  if (s.timer) clearInterval(s.timer)
  s.timer = null
}

export function getWatchdogStatus(): {
  state: EvolutionState | null
  lastCheckAt: string | null
} {
  const s = state()
  return {
    state: s.lastState,
    lastCheckAt: s.lastCheckAt ? s.lastCheckAt.toISOString() : null,
  }
}

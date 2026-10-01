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
import { getZapiConnectionState, restartZapi } from "@/lib/zapi"

// De quanto em quanto tempo perguntamos ao provedor se o WhatsApp está
// conectado. Ajustável pelo .env (WATCHDOG_POLL_SEC) pra dar pra mexer sem
// precisar de deploy.
//
// 30s davam 2.880 chamadas por dia só pra saber se está de pé — bastante pra
// um endpoint que existe pra detectar queda, e candidato a levar 429 do
// provedor (o que aparece como state "unknown" e polui a saúde). 120s detecta
// queda em até 2 minutos, que é de sobra pro nosso caso.
//
// Limites: mínimo 15s (abaixo disso é ataque ao provedor), máximo 10 min
// (acima disso a queda passa despercebida tempo demais).
const POLL_INTERVAL_MS = (() => {
  const bruto = Number.parseInt(process.env.WATCHDOG_POLL_SEC ?? "", 10)
  const seg = Number.isFinite(bruto) && bruto > 0 ? Math.min(600, Math.max(15, bruto)) : 120
  return seg * 1000
})()
const RECONNECT_BACKOFF_MS = 60_000 // não tenta reconectar mais que 1x/min

// Z-API: restart reconecta sem QR (doc oficial). Intervalo cresce a cada
// tentativa sem sucesso — 5, 10, 20, 40 min, depois de hora em hora — pra
// um fim de semana inteiro fora do ar não virar centenas de restarts.
const ZAPI_RESTART_BASE_MS = 5 * 60_000
const ZAPI_RESTART_MAX_MS = 60 * 60_000
// Aviso aos admins: só depois de a queda durar isso (o restart já teve
// chance de resolver), e repetido de tempos em tempos enquanto durar.
const ALERTA_APOS_MS = 10 * 60_000
const ALERTA_REPETE_MS = 4 * 60 * 60_000

const STATE_KEY = Symbol.for("whatsfrt.reliability.watchdog.state")

interface SharedState {
  timer: ReturnType<typeof setInterval> | null
  lastState: EvolutionState | null
  lastReconnectAttempt: number
  lastCheckAt: Date | null
  quedaDesde: number | null
  tentativasRestart: number
  proximoRestart: number
  ultimoAlerta: number | null
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
      quedaDesde: null,
      tentativasRestart: 0,
      proximoRestart: 0,
      ultimoAlerta: null,
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

// Notificação push pra todos os admins ativos. Push e não WhatsApp: com o
// WhatsApp fora do ar, mensagem por ele não chegaria.
async function avisarAdmins(title: string, body: string): Promise<void> {
  try {
    const { prisma } = await import("@/lib/prisma")
    const { sendPushToUsers } = await import("@/lib/push")
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    })
    await sendPushToUsers(admins.map((a) => a.id), {
      title,
      body,
      tag: "whatsapp-conexao",
      url: "/admin/connect",
    })
  } catch (err) {
    console.error("[watchdog] falha ao avisar admins:", err)
  }
}

// Z-API fora do ar: tenta restart (sem QR) com intervalo crescente e avisa os
// admins se a queda persistir. "unknown" = nem conseguimos falar com a Z-API
// (rede, 429) — restart não adiantaria, então só conta pro aviso.
async function cuidarDaQuedaZapi(detected: EvolutionState): Promise<void> {
  const s = state()
  const agora = Date.now()
  if (s.quedaDesde === null) {
    s.quedaDesde = agora
    s.tentativasRestart = 0
    s.proximoRestart = agora
  }

  if (detected === "close" && agora >= s.proximoRestart) {
    s.tentativasRestart += 1
    const ok = await restartZapi()
    const espera = Math.min(ZAPI_RESTART_BASE_MS * 2 ** (s.tentativasRestart - 1), ZAPI_RESTART_MAX_MS)
    s.proximoRestart = agora + espera
    console.warn(
      `[watchdog] Z-API restart #${s.tentativasRestart} ${ok ? "enviado" : "FALHOU"} — próxima tentativa em ${Math.round(espera / 60_000)} min`,
    )
  }

  const duracao = agora - s.quedaDesde
  const deveAvisar = duracao >= ALERTA_APOS_MS
    && (s.ultimoAlerta === null || agora - s.ultimoAlerta >= ALERTA_REPETE_MS)
  if (deveAvisar) {
    s.ultimoAlerta = agora
    const minutos = Math.round(duracao / 60_000)
    const tempo = minutos >= 120 ? `${Math.round(minutos / 60)} horas` : `${minutos} min`
    await avisarAdmins(
      "⚠️ WhatsApp desconectado",
      `Fora do ar há ${tempo}. A reconexão automática não resolveu — conecte pelo código de telefone em Conectar WhatsApp.`,
    )
  }
}

async function zapiVoltou(): Promise<void> {
  const s = state()
  if (s.quedaDesde === null) return
  const minutos = Math.round((Date.now() - s.quedaDesde) / 60_000)
  const avisado = s.ultimoAlerta !== null
  console.warn(`[watchdog] Z-API reconectado após ${minutos} min (${s.tentativasRestart} restart(s))`)
  s.quedaDesde = null
  s.tentativasRestart = 0
  s.proximoRestart = 0
  s.ultimoAlerta = null
  // Só avisa a volta pra quem recebeu o aviso da queda.
  if (avisado) {
    await avisarAdmins("✅ WhatsApp reconectado", `Voltou depois de ${minutos} min fora do ar.`)
  }
}

async function tryReconnect(): Promise<void> {
  const s = state()
  const now = Date.now()
  if (now - s.lastReconnectAttempt < RECONNECT_BACKOFF_MS) return
  s.lastReconnectAttempt = now

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

    if (activeProvider() === "zapi") {
      if (detected === "open") {
        await zapiVoltou()
      } else {
        console.error(`[watchdog] CRITICAL — Z-API NÃO está conectada (state=${detected}). Mensagens podem estar sendo perdidas.`)
        await cuidarDaQuedaZapi(detected)
      }
      return
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
  console.log(`[watchdog] iniciado (poll a cada ${POLL_INTERVAL_MS / 1000}s)`)
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

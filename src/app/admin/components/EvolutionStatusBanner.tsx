"use client"

import { useEffect, useState } from "react"
import type { SSEPayload } from "@/lib/sse-emitter"

type EvolutionState = "open" | "close" | "connecting" | "qrcode" | "unknown" | null

interface HealthResponse {
  checks?: {
    evolution?: { state?: EvolutionState }
  }
}

// Banner discreto que aparece quando a conexão WhatsApp NÃO está em "open".
// Some sozinho assim que o watchdog detecta retorno ao estado normal.
export default function EvolutionStatusBanner() {
  const [state, setState] = useState<EvolutionState>(null)

  // Estado inicial via /api/health pra não esperar o primeiro tick do watchdog.
  useEffect(() => {
    let cancelled = false
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((data) => {
        if (cancelled) return
        const s = data?.checks?.evolution?.state ?? null
        setState(s)
      })
      .catch(() => { /* health falhou — silencioso, SSE atualiza */ })
    return () => { cancelled = true }
  }, [])

  // Atualizações em tempo real via SSE.
  useEffect(() => {
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let alive = true

    const connect = () => {
      if (!alive) return
      source = new EventSource("/api/sse")
      source.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data as string) as SSEPayload
          if (p.type === "evolution_state") {
            setState(p.state)
          }
        } catch {
          // payload não-JSON (heartbeat etc) — ignora
        }
      }
      source.onerror = () => {
        source?.close()
        if (alive) retry = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => {
      alive = false
      if (retry) clearTimeout(retry)
      source?.close()
    }
  }, [])

  if (state === null || state === "open") return null

  const message =
    state === "close"      ? "WhatsApp desconectado. Escaneie o QR em Conectar para voltar a enviar/receber."
  : state === "connecting" ? "Conectando WhatsApp… aguarde alguns segundos."
  : state === "qrcode"     ? "WhatsApp aguardando pareamento. Abra Conectar e escaneie o QR."
  :                          "Status da conexão WhatsApp desconhecido. Verifique em Conectar."

  const bg = state === "connecting" ? "bg-amber-500" : "bg-red-600"

  return (
    <div className={`${bg} text-white text-[12.5px] px-4 py-2 flex items-center gap-2 border-b border-black/10`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
      </svg>
      <span className="flex-1">{message}</span>
      <a
        href="/admin/connect"
        className="rounded-md bg-white/15 hover:bg-white/25 px-3 py-1 font-medium transition-colors"
      >
        Abrir Conectar
      </a>
    </div>
  )
}

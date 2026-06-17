"use client"

import { useEffect, useState } from "react"

interface AgentCurrent {
  contactId: string
  contactName: string
  whatsappId: string
  chatStatus: "IN_SERVICE" | "AWAITING_RATING"
  inServiceSince: string | null
  waitingAgentSince: string | null
}

interface TeamAgent {
  agentId: string
  agentName: string
  department: string | null
  current: AgentCurrent | null
  sessionsToday: number
  avgRatingToday: number | null
}

interface QueueEntry {
  contactId: string
  contactName: string
  whatsappId: string
  waitingSince: string | null
}

interface HistoryEntry {
  sessionId: string
  agentId: string
  agentName: string
  contactId: string
  contactName: string
  startedAt: string
  endedAt: string
  waitedSec: number
  durationSec: number
  rating: number | null
  comment: string | null
  autoEnded: boolean
}

interface ApiResponse {
  timestamp: string
  team: TeamAgent[]
  queue: QueueEntry[]
  history: HistoryEntry[]
}

const STALE_AFTER_MIN = 10 // > 10min sem assumir = atrasado

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`
  const h = Math.floor(m / 60)
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`
}

function ratingStars(rating: number | null): string {
  if (rating === null) return "—"
  return "⭐".repeat(rating)
}

export default function TeamLiveClient() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true

    const fetchData = async () => {
      try {
        const res = await fetch("/api/admin/team/live", { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as ApiResponse
        if (alive) { setData(json); setError(null) }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Erro")
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const elapsedSec = (iso: string | null) => {
    if (!iso) return null
    return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  }

  if (!data && !error) {
    return <div className="p-6 text-sm text-zinc-500">Carregando…</div>
  }
  if (!data) {
    return <div className="p-6 text-sm text-red-600">Erro: {error}</div>
  }

  const inAttendance = data.team.filter((a) => a.current !== null)
  const free = data.team.filter((a) => a.current === null)

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-50 p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Equipe ao vivo</h1>
        <p className="text-[12px] text-zinc-500">
          Atualiza a cada 5s. Atrasado = espera ≥ {STALE_AFTER_MIN} min.
        </p>
      </header>

      {/* Em atendimento */}
      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          🟢 Em atendimento agora ({inAttendance.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {inAttendance.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-zinc-400">Ninguém em atendimento.</p>
          )}
          {inAttendance.length > 0 && (
            <table className="w-full text-[13px]">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Agente</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Atendendo há</th>
                  <th className="px-4 py-2">Esperou</th>
                  <th className="px-4 py-2">Atendimentos 24h</th>
                  <th className="px-4 py-2">Nota média</th>
                </tr>
              </thead>
              <tbody>
                {inAttendance.map((a) => {
                  const c = a.current!
                  const attendingFor = elapsedSec(c.inServiceSince)
                  const waitDuration =
                    c.waitingAgentSince && c.inServiceSince
                      ? Math.max(0, Math.floor(
                          (new Date(c.inServiceSince).getTime() -
                            new Date(c.waitingAgentSince).getTime()) / 1000,
                        ))
                      : null
                  return (
                    <tr key={a.agentId} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-2 font-medium text-zinc-800">
                        {a.agentName}
                        {a.department && (
                          <span className="ml-2 text-[10px] uppercase text-zinc-400">{a.department}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-zinc-700">
                        {c.contactName}
                        {c.chatStatus === "AWAITING_RATING" && (
                          <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                            aguardando nota
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-zinc-700">
                        {attendingFor !== null ? fmtDuration(attendingFor) : "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-zinc-500">
                        {waitDuration !== null ? fmtDuration(waitDuration) : "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-zinc-500">{a.sessionsToday}</td>
                      <td className="px-4 py-2 tabular-nums text-zinc-500">
                        {a.avgRatingToday !== null ? a.avgRatingToday.toFixed(1) : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Fila */}
      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          🟠 Fila — aguardando agente ({data.queue.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {data.queue.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-zinc-400">Ninguém esperando. 👌</p>
          )}
          {data.queue.length > 0 && (
            <table className="w-full text-[13px]">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Esperando há</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.map((q) => {
                  const waited = elapsedSec(q.waitingSince)
                  const late = waited !== null && waited > STALE_AFTER_MIN * 60
                  return (
                    <tr key={q.contactId} className="border-b border-zinc-50 last:border-0">
                      <td className="px-4 py-2 text-zinc-800">{q.contactName}</td>
                      <td className={`px-4 py-2 tabular-nums ${late ? "font-semibold text-red-600" : "text-zinc-700"}`}>
                        {waited !== null ? fmtDuration(waited) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {late ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                            ⚠ Atrasado
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-400">aguardando</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Livres */}
      <section className="mb-6">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          ⚪ Agentes livres ({free.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          {free.length === 0 && (
            <p className="text-[13px] text-zinc-400">Todo mundo ocupado.</p>
          )}
          {free.map((a) => (
            <span
              key={a.agentId}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-700"
            >
              {a.agentName}
              {a.sessionsToday > 0 && (
                <span className="text-[10px] text-zinc-400">{a.sessionsToday} hoje</span>
              )}
            </span>
          ))}
        </div>
      </section>

      {/* Histórico */}
      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          📜 Histórico — últimas 24h ({data.history.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {data.history.length === 0 && (
            <p className="px-4 py-3 text-[13px] text-zinc-400">Nenhum atendimento encerrado nas últimas 24h.</p>
          )}
          {data.history.length > 0 && (
            <table className="w-full text-[13px]">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Iniciou</th>
                  <th className="px-4 py-2">Agente</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Esperou</th>
                  <th className="px-4 py-2">Duração</th>
                  <th className="px-4 py-2">Nota</th>
                  <th className="px-4 py-2">Comentário</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.sessionId} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-2 tabular-nums text-zinc-500">
                      {new Date(h.startedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-2 text-zinc-700">{h.agentName}</td>
                    <td className="px-4 py-2 text-zinc-700">{h.contactName}</td>
                    <td className="px-4 py-2 tabular-nums text-zinc-500">{fmtDuration(h.waitedSec)}</td>
                    <td className="px-4 py-2 tabular-nums text-zinc-500">
                      {fmtDuration(h.durationSec)}
                      {h.autoEnded && (
                        <span className="ml-1 text-[10px] uppercase text-amber-600">auto</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-zinc-700">{ratingStars(h.rating)}</td>
                    <td className="px-4 py-2 text-[12px] text-zinc-500" title={h.comment ?? ""}>
                      {h.comment ? (h.comment.length > 40 ? h.comment.slice(0, 40) + "…" : h.comment) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

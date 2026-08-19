"use client"

import { useEffect, useState } from "react"

interface DistributionEntry { rating: number; count: number }
interface RankingEntry {
  agentId: string
  agentName: string
  avgRating: number
  ratedCount: number
}
interface LowRatingEntry {
  sessionId: string
  rating: number | null
  comment: string | null
  ratedAt: string | null
  durationSec: number
  agentId: string
  agentName: string
  contactId: string
  contactName: string
}
interface ApiResponse {
  days: number
  csat: number | null
  ratedCount: number
  responseRate: number | null
  distribution: DistributionEntry[]
  promoters: number
  detractors: number
  ranking: RankingEntry[]
  recentLow: LowRatingEntry[]
}

function fmtPct(n: number | null): string {
  if (n === null) return "—"
  return `${Math.round(n * 100)}%`
}

function StarBar({ rating, count, max }: { rating: number; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 text-right text-[12px] font-medium text-zinc-700">{rating}⭐</span>
      <div className="flex-1 h-6 rounded bg-zinc-100 overflow-hidden">
        <div
          className={`h-full ${rating >= 4 ? "bg-emerald-400" : rating >= 3 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 text-[12px] tabular-nums text-zinc-500">{count}</span>
    </div>
  )
}

export default function RatingsClient() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/admin/ratings?days=${days}`, { cache: "no-store" })
      .then((r) => r.json() as Promise<ApiResponse>)
      .then((j) => { if (alive) { setData(j); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days])

  if (loading || !data) {
    return <div className="p-6 text-sm text-zinc-500">Carregando…</div>
  }

  const maxDistribution = Math.max(1, ...data.distribution.map((d) => d.count))
  const csat = data.csat
  const csatColor = csat === null
    ? "text-zinc-400"
    : csat >= 4 ? "text-emerald-600"
    : csat >= 3 ? "text-amber-600"
    : "text-red-600"

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-50 p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Avaliações dos clientes</h1>
          <p className="text-[12px] text-zinc-500">CSAT e ranking nos últimos {data.days} dias</p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-lg border px-3 py-1 text-[12px] font-medium transition-colors ${
                days === d
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
      </header>

      {/* Cards superiores */}
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">CSAT médio</p>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${csatColor}`}>
            {csat !== null ? csat.toFixed(2) : "—"}
            <span className="text-[14px] font-normal text-zinc-400"> / 5</span>
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Notas recebidas</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-800">{data.ratedCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Taxa de resposta</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-800">{fmtPct(data.responseRate)}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Detratores (1-2)</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-red-600">{data.detractors}</p>
        </div>
      </section>

      {/* Distribuição */}
      <section className="mb-6">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          Distribuição de notas
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const d = data.distribution.find((x) => x.rating === star)
            return (
              <StarBar
                key={star}
                rating={star}
                count={d?.count ?? 0}
                max={maxDistribution}
              />
            )
          })}
        </div>
      </section>

      {/* Ranking por agente */}
      <section className="mb-6">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          Ranking por agente
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          {data.ranking.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-zinc-400">Sem avaliações no período.</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Agente</th>
                  <th className="px-4 py-2">CSAT</th>
                  <th className="px-4 py-2">Notas</th>
                </tr>
              </thead>
              <tbody>
                {data.ranking.map((r, i) => (
                  <tr key={r.agentId} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-2 tabular-nums text-zinc-400">{i + 1}</td>
                    <td className="px-4 py-2 font-medium text-zinc-800">{r.agentName}</td>
                    <td className={`px-4 py-2 tabular-nums font-medium ${
                      r.avgRating >= 4 ? "text-emerald-600"
                      : r.avgRating >= 3 ? "text-amber-600"
                      : "text-red-600"
                    }`}>
                      {r.avgRating.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 tabular-nums text-zinc-500">{r.ratedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Notas baixas recentes */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          Notas baixas (1-2) recentes — precisam de revisão
        </h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          {data.recentLow.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-zinc-400">Nenhuma nota baixa no período. 🎉</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Quando</th>
                  <th className="px-4 py-2">Nota</th>
                  <th className="px-4 py-2">Agente</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Comentário</th>
                </tr>
              </thead>
              <tbody>
                {data.recentLow.map((r) => (
                  <tr key={r.sessionId} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-2 tabular-nums text-zinc-500">
                      {r.ratedAt ? new Date(r.ratedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td className="px-4 py-2 font-semibold text-red-600">
                      {r.rating}⭐
                    </td>
                    <td className="px-4 py-2 text-zinc-700">{r.agentName}</td>
                    <td className="px-4 py-2 text-zinc-700">{r.contactName}</td>
                    <td className="px-4 py-2 text-[12px] text-zinc-600">
                      {r.comment ?? <span className="text-zinc-400">— sem comentário</span>}
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

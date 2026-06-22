"use client"

import { useEffect, useState } from "react"

type Role = "ADMIN" | "AGENT"

interface HomeStats {
  timestamp: string
  kpis: {
    inService: number
    waiting: number
    csat: { avg: number | null; count: number }
    avgResponseMin: number | null
  }
  volumeByHour: number[]
  agents: Array<{
    id: string
    name: string
    status: "ATTENDING" | "ONLINE" | "OFFLINE"
    attendingCount: number
  }>
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

// ─── KPI card ───────────────────────────────────────────────────────────────
// loading=true: mostra retângulo pulsando no lugar do valor (skeleton).
function Kpi({
  label, value, hint, accent, loading,
}: Readonly<{
  label: string
  value: string
  hint?: string
  accent?: "neutral" | "emerald" | "amber" | "sky"
  loading?: boolean
}>) {
  const accentCls = {
    neutral: "text-zinc-900",
    emerald: "text-emerald-600",
    amber:   "text-amber-600",
    sky:     "text-sky-600",
  }[accent ?? "neutral"]
  return (
    <div className="anim-slide-up rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm shadow-zinc-100/60">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      {loading ? (
        <div className="mt-2.5 h-8 w-16 animate-pulse rounded-md bg-zinc-100" />
      ) : (
        <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${accentCls}`}>{value}</p>
      )}
      {loading ? (
        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-zinc-100/70" />
      ) : (
        hint && <p className="mt-1 text-[11px] text-zinc-400">{hint}</p>
      )}
    </div>
  )
}

// ─── Volume sparkline (24 buckets) ──────────────────────────────────────────
function HourlyVolume({ volume }: Readonly<{ volume: number[] }>) {
  const max = Math.max(1, ...volume)
  const total = volume.reduce((a, b) => a + b, 0)
  return (
    <div className="anim-slide-up rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm shadow-zinc-100/60">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Mensagens hoje por hora</p>
        <p className="text-[11px] font-medium text-zinc-500">{total} no total</p>
      </div>
      <div className="mt-4 flex h-24 items-end gap-1">
        {volume.map((v, h) => (
          <div key={h} className="group flex flex-1 flex-col items-center justify-end" title={`${String(h).padStart(2, "0")}h — ${v} msg`}>
            <div
              className="w-full rounded-t bg-emerald-200/70 transition-colors group-hover:bg-emerald-500"
              style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between px-0.5 text-[9px] tabular-nums text-zinc-300">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    </div>
  )
}

// ─── Equipe — presença real ────────────────────────────────────────────────
// Presença derivada do Set de clientes SSE no servidor (quem tem aba aberta
// no momento). Tres estados:
//   ATTENDING  → tem chat IN_SERVICE  (emerald)
//   ONLINE     → conectado mas sem chat (verde claro)
//   OFFLINE    → cadastrado mas sem aba aberta (cinza)
function AgentList({ agents }: Readonly<{ agents: HomeStats["agents"] }>) {
  const attending = agents.filter((a) => a.status === "ATTENDING").length
  const online    = agents.filter((a) => a.status === "ONLINE").length
  const offline   = agents.filter((a) => a.status === "OFFLINE").length
  return (
    <div className="anim-slide-up rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm shadow-zinc-100/60">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Equipe</p>
        <p className="text-[11px] font-medium text-zinc-500">
          {attending} atendendo · {online} online · {offline} offline
        </p>
      </div>
      {agents.length === 0 && (
        <p className="mt-4 text-[12px] text-zinc-400">Nenhum agente cadastrado.</p>
      )}
      <ul className="mt-3 space-y-2">
        {agents.map((a) => {
          const dotCls = a.status === "ATTENDING" ? "bg-emerald-500"
                       : a.status === "ONLINE"    ? "bg-emerald-300"
                       : "bg-zinc-300"
          return (
            <li key={a.id} className="flex items-center gap-3 py-1">
              <div className="relative flex-shrink-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-[12px] font-semibold text-zinc-600">
                  {a.name.charAt(0).toUpperCase()}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${dotCls}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-[13px] font-medium ${a.status === "OFFLINE" ? "text-zinc-400" : "text-zinc-800"}`}>{a.name}</p>
              </div>
              {a.status === "ATTENDING" && (
                <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Atendendo · {a.attendingCount}
                </span>
              )}
              {a.status === "ONLINE" && (
                <span className="flex-shrink-0 rounded-full bg-emerald-50/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-600">
                  Online
                </span>
              )}
              {a.status === "OFFLINE" && (
                <span className="flex-shrink-0 rounded-full bg-zinc-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                  Offline
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Atalhos ────────────────────────────────────────────────────────────────
function Shortcuts({ isAdmin }: Readonly<{ isAdmin: boolean }>) {
  const items = [
    { href: "/admin/chats", label: "Atender chats", desc: "Lista de conversas ao vivo" },
    { href: "/admin/contatos", label: "Contatos", desc: "Base de clientes", adminOnly: true },
    { href: "/admin/avaliacoes", label: "Avaliações", desc: "Notas dadas pelos clientes", adminOnly: true },
    { href: "/admin/transmissao", label: "Transmissão", desc: "Envio em massa" },
  ].filter((i) => !i.adminOnly || isAdmin)

  return (
    <div className="anim-slide-up rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm shadow-zinc-100/60">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Atalhos</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {items.map((it) => (
          <a
            key={it.href}
            href={it.href}
            className="group rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 transition-colors hover:border-zinc-200 hover:bg-zinc-50"
          >
            <p className="text-[13px] font-semibold text-zinc-800">{it.label}</p>
            <p className="mt-0.5 text-[11px] text-zinc-400">{it.desc}</p>
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────
export default function HomeClient({ userName, userRole }: Readonly<{ userName: string; userRole: Role }>) {
  const [stats, setStats] = useState<HomeStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = userRole === "ADMIN"

  useEffect(() => {
    if (!isAdmin) return // agentes não veem KPIs globais
    let cancelled = false

    const fetchStats = async () => {
      try {
        const res = await fetch("/api/admin/home-stats", { cache: "no-store" })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const data = (await res.json()) as HomeStats
        if (!cancelled) setStats(data)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "erro desconhecido")
      }
    }

    void fetchStats()
    // Refresh a cada 30s — leve, e mantém a tela viva
    const id = setInterval(fetchStats, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [isAdmin])

  // Agentes não veem essa tela. Mandam direto pra /admin/chats que é o
  // espaço deles. Defesa em profundidade — a rota não retorna nada de
  // sensível, mas evita mostrar UI vazia.
  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-50 p-8">
        <div className="max-w-md rounded-2xl border border-zinc-100 bg-white p-8 text-center shadow-sm">
          <p className="text-[13px] font-semibold text-zinc-700">Bem-vindo, {userName}.</p>
          <p className="mt-2 text-[12px] text-zinc-500">Sua tela de atendimento está em <a className="font-semibold text-emerald-600 underline-offset-2 hover:underline" href="/admin/chats">Chats</a>.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">

        {/* ── Cabeçalho ── */}
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
              {greeting()}, {userName.split(" ")[0]}
            </h1>
            <p className="mt-1 text-[13px] text-zinc-500">
              Resumo da operação ao vivo.
              {stats && (
                <span className="ml-2 text-zinc-300">
                  · atualizado {new Date(stats.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </p>
          </div>
        </header>

        {/* ── KPIs ── */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Em atendimento"
            value={stats ? String(stats.kpis.inService) : "—"}
            hint="chats ativos agora"
            accent="emerald"
            loading={!stats}
          />
          <Kpi
            label="Aguardando agente"
            value={stats ? String(stats.kpis.waiting) : "—"}
            hint="clientes na fila"
            accent={stats && stats.kpis.waiting > 0 ? "amber" : "neutral"}
            loading={!stats}
          />
          <Kpi
            label="CSAT 24h"
            value={stats?.kpis.csat.avg !== null && stats?.kpis.csat.avg !== undefined ? `${stats.kpis.csat.avg.toFixed(1)} ★` : "—"}
            hint={stats ? `${stats.kpis.csat.count} avaliação${stats.kpis.csat.count === 1 ? "" : "ões"}` : "—"}
            accent="sky"
            loading={!stats}
          />
          <Kpi
            label="Resposta média"
            value={stats?.kpis.avgResponseMin !== null && stats?.kpis.avgResponseMin !== undefined ? `${stats.kpis.avgResponseMin}m` : "—"}
            hint="primeira resposta 24h"
            loading={!stats}
          />
        </section>

        {/* ── Volume + agentes ── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <HourlyVolume volume={stats?.volumeByHour ?? new Array(24).fill(0)} />
          </div>
          <AgentList agents={stats?.agents ?? []} />
        </section>

        {/* ── Atalhos ── */}
        <section>
          <Shortcuts isAdmin={isAdmin} />
        </section>

        {error && (
          <p className="text-[11px] text-red-500">⚠️ Falha ao buscar KPIs: {error}</p>
        )}
      </div>
    </div>
  )
}

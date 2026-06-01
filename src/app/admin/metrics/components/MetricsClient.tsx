"use client"

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts"

type AgentStat = { name: string; avgMs: number; avgMin: number; count: number }

type MetricsData = {
  totalContacts: number
  totalInService: number
  avgResponseMs: number
  avgResponseMin: number
  globalCount: number
  byAgent: AgentStat[]
}

function StatCard({
  title, value, subtitle,
}: Readonly<{ title: string; value: string | number; subtitle?: string }>) {
  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-widest text-zinc-400">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900">{value}</p>
      {subtitle && <p className="mt-1 text-[12px] text-zinc-400">{subtitle}</p>}
    </div>
  )
}

function formatMs(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}min`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

const BAR_COLORS = [
  "#22c55e", "#16a34a", "#86efac", "#4ade80",
  "#15803d", "#bbf7d0", "#14532d", "#dcfce7",
]

export default function MetricsClient({ data }: Readonly<{ data: MetricsData }>) {
  const chartData = data.byAgent.map((a) => ({
    name: a.name.split(" ")[0],
    fullName: a.name,
    avgMin: a.avgMin,
    count: a.count,
  }))

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Métricas de SLA</h1>
        <p className="mt-0.5 text-[13px] text-zinc-500">Desempenho de atendimento em tempo real</p>
      </div>

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Total de Contatos"
          value={data.totalContacts}
          subtitle="cadastrados"
        />
        <StatCard
          title="Em Atendimento"
          value={data.totalInService}
          subtitle="ativos agora"
        />
        <StatCard
          title="Tempo Médio"
          value={data.avgResponseMs > 0 ? formatMs(data.avgResponseMs) : "—"}
          subtitle="primeira resposta"
        />
        <StatCard
          title="Respostas Analisadas"
          value={data.globalCount}
          subtitle="pares INBOUND→OUTBOUND"
        />
      </div>

      {/* Bar chart */}
      {chartData.length > 0 ? (
        <div className="flex-1 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <p className="mb-4 text-[12px] font-semibold uppercase tracking-widest text-zinc-400">
            Tempo Médio de Resposta por Agente (min)
          </p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barCategoryGap="35%" margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#a1a1aa" }}
                axisLine={false}
                tickLine={false}
                unit=" min"
              />
              <Tooltip
                cursor={{ fill: "#f4f4f5" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as typeof chartData[number]
                  return (
                    <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-lg text-xs">
                      <p className="font-semibold text-zinc-800">{d.fullName}</p>
                      <p className="mt-1 text-zinc-500">Tempo médio: <span className="font-medium text-zinc-800">{d.avgMin} min</span></p>
                      <p className="text-zinc-500">Respostas: <span className="font-medium text-zinc-800">{d.count}</span></p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="avgMin" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-white">
          <div className="text-center">
            <p className="text-[13px] font-medium text-zinc-500">Sem dados suficientes</p>
            <p className="text-[12px] text-zinc-400">Envie mensagens para gerar métricas</p>
          </div>
        </div>
      )}
    </div>
  )
}

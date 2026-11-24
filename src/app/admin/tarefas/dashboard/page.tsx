"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

// ─── Dashboard das tarefas (administrador) ──────────────────────────────────
// Situação geral, quem está em dia ou atrasado e o que precisa de decisão.
// Atualiza sozinho a cada 30 s.

interface Resumo {
  dias: number; atualizadoEm: string
  totais: { abertas: number; atrasadas: number; aguardandoDecisao: number; semCiente: number; criadas: number; concluidas: number; noPrazo: number; foraPrazo: number; pctNoPrazo: number | null; tempoMedioH: number | null; pedidosPrazo: number; pedidosAprovados: number; pedidosRecusados: number }
  porPessoa: { id: string; nome: string; abertas: number; atrasadas: number; concluidas: number; noPrazo: number; foraPrazo: number; pctNoPrazo: number | null; tempoMedioH: number | null; pedidosPrazo: number }[]
  atencao: { id: string; titulo: string; paraNome: string; prazoEm: string; motivo: "PEDIDO_DE_PRAZO" | "ATRASADA" | "SEM_CIENTE"; prazoProposto: string | null; justificativa: string | null }[]
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const duracao = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toLocaleString("pt-BR")} h` : `${(h / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`)
const MOTIVO = { PEDIDO_DE_PRAZO: { r: "Pediu outro prazo", c: "bg-amber-100 text-amber-800" }, ATRASADA: { r: "Atrasada", c: "bg-red-100 text-red-700" }, SEM_CIENTE: { r: "Sem resposta ao prazo", c: "bg-zinc-200 text-zinc-700" } }

function Cartao({ titulo, valor, nota, cor }: { titulo: string; valor: string | number; nota?: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-[12px] font-medium text-zinc-500">{titulo}</p>
      <p className={`mt-1 text-[28px] font-bold leading-none ${cor ?? "text-zinc-800"}`}>{valor}</p>
      {nota && <p className="mt-1.5 text-[11.5px] text-zinc-400">{nota}</p>}
    </div>
  )
}

export default function DashboardTarefas() {
  const [dias, setDias] = useState(30)
  const [d, setD] = useState<Resumo | null>(null)
  const [erro, setErro] = useState("")

  const carregar = useCallback(async (n: number) => {
    try {
      const r = await fetch(`/api/admin/tarefas/resumo?dias=${n}`, { cache: "no-store" })
      if (!r.ok) throw new Error()
      setD((await r.json()) as Resumo); setErro("")
    } catch { setErro("Não consegui atualizar o dashboard. Tentando de novo…") }
  }, [])

  useEffect(() => {
    void (async () => { await carregar(dias) })()
    const t = setInterval(() => void carregar(dias), 30_000)
    return () => clearInterval(t)
  }, [carregar, dias])

  const t = d?.totais
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-800">📊 Dashboard das tarefas</h1>
          <p className="text-[13px] text-zinc-500">Situação atual e desempenho no período. <Link href="/admin/tarefas" className="text-emerald-700 underline">Voltar para as tarefas</Link></p>
        </div>
        <div className="flex gap-1 rounded-xl bg-zinc-100 p-1" role="group" aria-label="Período">
          {[7, 30, 90].map((n) => (
            <button key={n} onClick={() => setDias(n)} aria-pressed={dias === n} className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${dias === n ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500"}`}>{n} dias</button>
          ))}
        </div>
      </div>

      {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{erro}</p>}
      {!d ? <p className="text-[13px] text-zinc-400">Carregando…</p> : t && (
        <>
          <section aria-label="Situação agora">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Situação agora</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Cartao titulo="Em aberto" valor={t.abertas} />
              <Cartao titulo="Atrasadas" valor={t.atrasadas} cor={t.atrasadas ? "text-red-600" : "text-emerald-600"} nota={t.atrasadas ? "passaram do prazo" : "nenhuma atrasada"} />
              <Cartao titulo="Pedidos de novo prazo" valor={t.aguardandoDecisao} cor={t.aguardandoDecisao ? "text-amber-600" : undefined} nota="aguardando sua decisão" />
              <Cartao titulo="Sem resposta ao prazo" valor={t.semCiente} nota="ainda não aceitaram nem propuseram" />
            </div>
          </section>

          <section aria-label={`Últimos ${d.dias} dias`}>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Últimos {d.dias} dias</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Cartao titulo="Criadas" valor={t.criadas} />
              <Cartao titulo="Concluídas" valor={t.concluidas} nota={`${t.noPrazo} no prazo · ${t.foraPrazo} fora do prazo`} />
              <Cartao titulo="Concluídas no prazo" valor={t.pctNoPrazo === null ? "—" : `${t.pctNoPrazo}%`} cor={t.pctNoPrazo === null ? undefined : t.pctNoPrazo >= 80 ? "text-emerald-600" : t.pctNoPrazo >= 50 ? "text-amber-600" : "text-red-600"} />
              <Cartao titulo="Tempo médio até concluir" valor={duracao(t.tempoMedioH)} nota="da criação ao feedback" />
            </div>
            {t.pedidosPrazo > 0 && <p className="mt-2 text-[12.5px] text-zinc-500">🗓️ Pedidos de novo prazo: {t.pedidosPrazo} ({t.pedidosAprovados} aprovados, {t.pedidosRecusados} mantidos, {t.pedidosPrazo - t.pedidosAprovados - t.pedidosRecusados} pendentes).</p>}
          </section>

          <section aria-label="Precisa de atenção">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Precisa de atenção ({d.atencao.length})</h2>
            {d.atencao.length === 0 ? <p className="rounded-xl bg-emerald-50 px-3 py-4 text-center text-[13px] text-emerald-700">Nada pendente de ação. ✅</p> : (
              <ul className="space-y-2">
                {d.atencao.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5">
                    <div>
                      <p className="text-[14px] font-medium text-zinc-800">{a.titulo}</p>
                      <p className="text-[12px] text-zinc-500">{a.paraNome} · prazo {quando(a.prazoEm)}{a.motivo === "PEDIDO_DE_PRAZO" && a.prazoProposto ? ` → pede ${quando(a.prazoProposto)} (${a.justificativa})` : ""}</p>
                    </div>
                    <Link href="/admin/tarefas" className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${MOTIVO[a.motivo].c}`}>{MOTIVO[a.motivo].r}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Por pessoa">
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Por pessoa</h2>
            <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-zinc-50 text-[11.5px] uppercase tracking-wide text-zinc-500">
                  <tr><th className="px-3 py-2">Pessoa</th><th className="px-3 py-2">Em aberto</th><th className="px-3 py-2">Atrasadas</th><th className="px-3 py-2">Concluídas</th><th className="px-3 py-2 w-40">No prazo</th><th className="px-3 py-2">Tempo médio</th><th className="px-3 py-2">Pedidos de prazo</th></tr>
                </thead>
                <tbody>
                  {d.porPessoa.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-zinc-400">Ainda não há tarefas no período.</td></tr>}
                  {d.porPessoa.map((p) => (
                    <tr key={p.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 font-medium text-zinc-800">{p.nome}</td>
                      <td className="px-3 py-2">{p.abertas}</td>
                      <td className={`px-3 py-2 font-semibold ${p.atrasadas ? "text-red-600" : "text-zinc-400"}`}>{p.atrasadas}</td>
                      <td className="px-3 py-2">{p.concluidas}</td>
                      <td className="px-3 py-2">
                        {p.pctNoPrazo === null ? <span className="text-zinc-400">—</span> : (
                          <div className="flex items-center gap-2" title={`${p.noPrazo} no prazo, ${p.foraPrazo} fora do prazo`}>
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-red-100"><div className="h-full bg-emerald-500" style={{ width: `${p.pctNoPrazo}%` }} /></div>
                            <span className="text-[12px] text-zinc-600">{p.pctNoPrazo}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">{duracao(p.tempoMedioH)}</td>
                      <td className="px-3 py-2">{p.pedidosPrazo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="text-[11.5px] text-zinc-400">Atualizado às {new Date(d.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · os números são só informativos; qualquer decisão sobre a equipe é sua.</p>
        </>
      )}
    </div>
  )
}

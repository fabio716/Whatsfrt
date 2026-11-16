"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

// ─── Central de agentes (admin) ──────────────────────────────────────────────
// Rede visual: o orquestrador no centro e os agentes do frtwhats em volta, com
// o estado de cada um. Clique num agente para ver o que ele achou e o próximo
// passo. Atualiza sozinho a cada 30 s. Só leitura.

type Estado = "OK" | "RODANDO" | "ATENCAO" | "CRITICO" | "OCIOSO"
interface Agente { id: string; nome: string; icone: string; estado: Estado; resumo: string; achou: string[]; proximo: string; link: string; itens?: { titulo: string; detalhe: string; link: string }[] }
interface Dados { atualizadoEm: string; orquestrador: { estado: Estado; resumo: string; prioridades: string[] }; agentes: Agente[] }

const COR: Record<Estado, { anel: string; texto: string; rotulo: string }> = {
  OK: { anel: "#4ade80", texto: "#86efac", rotulo: "CONCLUÍDO" },
  RODANDO: { anel: "#60a5fa", texto: "#93c5fd", rotulo: "RODANDO" },
  ATENCAO: { anel: "#fbbf24", texto: "#fcd34d", rotulo: "ATENÇÃO" },
  CRITICO: { anel: "#f87171", texto: "#fca5a5", rotulo: "CRÍTICO" },
  OCIOSO: { anel: "#a78bfa", texto: "#c4b5fd", rotulo: "NA FILA" },
}

// Posições (em % do quadro) — o orquestrador fica no centro (50, 43).
const POSICOES = [{ x: 18, y: 15 }, { x: 82, y: 15 }, { x: 14, y: 62 }, { x: 86, y: 62 }, { x: 50, y: 83 }]

function Robo({ cor }: { cor: string }) {
  return (
    <g>
      <rect x="-3.2" y="-2.2" width="6.4" height="5" rx="1.6" fill={cor} />
      <circle cx="-1.2" cy="0" r="0.6" fill="#0a1020" /><circle cx="1.2" cy="0" r="0.6" fill="#0a1020" />
      <line x1="0" y1="-2.2" x2="0" y2="-3.6" stroke={cor} strokeWidth="0.5" /><circle cx="0" cy="-3.9" r="0.7" fill={cor} />
    </g>
  )
}

export default function VisaoPage() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState("")
  const [sel, setSel] = useState<string>("orq")

  useEffect(() => {
    let vivo = true
    const buscar = async () => {
      try {
        const r = await fetch("/api/admin/visao", { cache: "no-store" })
        if (!r.ok) throw new Error()
        const d = (await r.json()) as Dados
        if (vivo) { setDados(d); setErro("") }
      } catch { if (vivo) setErro("Não consegui atualizar. Tentando de novo…") }
    }
    void buscar()
    const t = setInterval(() => void buscar(), 30_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  const agentes = dados?.agentes ?? []
  const atual = sel === "orq" ? null : agentes.find((a) => a.id === sel) ?? null

  return (
    <div className="min-h-full bg-[#070b17] p-4 text-slate-100 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-white/10 pb-3">
          <h1 className="text-2xl font-bold">Agentes</h1>
          <p className="text-sm text-slate-400">Clique em um agente para ver o que ele achou e o próximo passo.</p>
          {dados && <span className="ml-auto font-mono text-[11px] text-slate-500">atualizado {new Date(dados.atualizadoEm).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>}
        </div>
        {erro && <p role="alert" className="mt-2 text-sm text-amber-300">⚠️ {erro}</p>}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0a1020]" style={{ aspectRatio: "1 / 1.08" }}>
            <span className="absolute left-4 top-3 font-mono text-[11px] tracking-[0.3em] text-slate-500">REDE DE AGENTES</span>
            {!dados ? (
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Carregando agentes…</p>
            ) : (
              <>
                <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                  {agentes.map((a, i) => {
                    const p = POSICOES[i]; const cor = COR[a.estado].anel
                    const d = `M ${p.x} ${p.y} Q ${(p.x + 50) / 2 + (i % 2 ? 6 : -6)} ${(p.y + 43) / 2} 50 43`
                    const ativo = a.estado === "RODANDO" || a.estado === "ATENCAO" || a.estado === "CRITICO"
                    return (
                      <g key={a.id}>
                        <path d={d} fill="none" stroke={cor} strokeOpacity={ativo ? 0.55 : 0.25} strokeWidth="0.35" strokeDasharray={a.estado === "OCIOSO" ? "1 1.2" : undefined} />
                        {ativo && (
                          <g>
                            <g transform="scale(0.7)"><Robo cor={cor} /></g>
                            <animateMotion dur={`${5 + i}s`} repeatCount="indefinite" path={d} rotate="0" />
                          </g>
                        )}
                      </g>
                    )
                  })}
                </svg>

                <button type="button" onClick={() => setSel("orq")} aria-label="Orquestrador" aria-pressed={sel === "orq"}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: "50%", top: "43%" }}>
                  <span className="flex h-[min(20vw,8.5rem)] w-[min(20vw,8.5rem)] items-center justify-center rounded-full border-[3px] bg-[#0e1730] text-4xl shadow-[0_0_30px_rgba(120,140,255,.25)]" style={{ borderColor: dados ? COR[dados.orquestrador.estado].anel : "#60a5fa" }}>✳️</span>
                  <span className="mt-1 block font-mono text-[11px] tracking-[0.25em] text-slate-400">ORQUESTRADOR</span>
                  {dados && <span className="mt-0.5 block font-mono text-[10.5px]" style={{ color: COR[dados.orquestrador.estado].texto }}>{dados.orquestrador.resumo}</span>}
                </button>

                {agentes.map((a, i) => {
                  const p = POSICOES[i]; const c = COR[a.estado]
                  return (
                    <button key={a.id} type="button" onClick={() => setSel(a.id)} aria-pressed={sel === a.id}
                      className="absolute w-[34%] -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                      <span className={`mx-auto flex h-[min(15vw,6.2rem)] w-[min(15vw,6.2rem)] items-center justify-center rounded-full border-[3px] bg-[#0e1730] text-2xl transition-transform hover:scale-105 ${sel === a.id ? "scale-105" : ""}`}
                        style={{ borderColor: c.anel, boxShadow: `0 0 ${sel === a.id ? 28 : 16}px ${c.anel}55`, borderStyle: a.estado === "OCIOSO" ? "dashed" : "solid" }}>
                        {a.icone}
                      </span>
                      <span className="mt-1 block text-[12.5px] font-semibold leading-tight text-slate-100 sm:text-sm">{a.nome}</span>
                      <span className="mt-1 inline-block rounded-full border px-2 py-0.5 font-mono text-[9.5px] tracking-wider sm:text-[10.5px]" style={{ borderColor: c.anel, color: c.texto }}>{a.resumo}</span>
                    </button>
                  )
                })}
              </>
            )}
          </div>

          <aside className="rounded-3xl border border-white/10 bg-[#0a1020] p-5" aria-live="polite">
            {!dados ? null : atual ? (
              <>
                <p className="font-mono text-[11px] tracking-[0.25em]" style={{ color: COR[atual.estado].texto }}>{COR[atual.estado].rotulo}</p>
                <h2 className="mt-1 text-xl font-bold">{atual.icone} {atual.nome}</h2>
                <p className="mt-4 font-mono text-[11px] tracking-[0.25em] text-slate-500">O QUE ACHOU</p>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate-200">
                  {atual.achou.map((t, i) => <li key={i} className="rounded-lg bg-white/5 px-3 py-2">{t}</li>)}
                </ul>
                {atual.itens && atual.itens.length > 0 && (
                  <>
                    <p className="mt-4 font-mono text-[11px] tracking-[0.25em] text-slate-500">QUEM É</p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {atual.itens.map((it, i) => (
                        <li key={i}>
                          <Link href={it.link} className="block rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10">
                            <span className="font-semibold text-slate-100">{it.titulo}</span>
                            <span className="block text-[12px] text-slate-400">{it.detalhe}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <p className="mt-4 font-mono text-[11px] tracking-[0.25em] text-slate-500">PRÓXIMO PASSO</p>
                <p className="mt-2 text-sm text-slate-100">{atual.proximo}</p>
                <Link href={atual.link} className="mt-4 inline-block rounded-xl bg-[#00bf5b] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00a950]">Abrir</Link>
              </>
            ) : (
              <>
                <p className="font-mono text-[11px] tracking-[0.25em]" style={{ color: COR[dados.orquestrador.estado].texto }}>{dados.orquestrador.resumo}</p>
                <h2 className="mt-1 text-xl font-bold">✳️ Orquestrador</h2>
                <p className="mt-3 text-sm text-slate-300">Junta o que cada agente achou e mostra o que precisa da sua atenção primeiro.</p>
                <p className="mt-4 font-mono text-[11px] tracking-[0.25em] text-slate-500">PRIORIDADES</p>
                {dados.orquestrador.prioridades.length === 0
                  ? <p className="mt-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-emerald-300">Tudo em dia. Nada pede a sua atenção agora. 👏</p>
                  : <ul className="mt-2 space-y-2 text-sm text-slate-200">{dados.orquestrador.prioridades.map((t, i) => <li key={i} className="rounded-lg bg-white/5 px-3 py-2">{t}</li>)}</ul>}
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

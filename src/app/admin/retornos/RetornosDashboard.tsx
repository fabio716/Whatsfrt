"use client"

import { useCallback, useEffect, useState } from "react"
import Mascote from "@/components/ui/Mascote"

// ─── Retornos da equipe (administrador) ──────────────────────────────────────
// Cada agente está respeitando o horário combinado nos retornos do atendente
// virtual? Respeitou = atendeu até 30 min depois do combinado (respondendo no
// chat ou marcando "Fiz o retorno"). A barra de cada agente mostra a mistura
// dos quatro estados; clicar filtra a lista de baixo.

type Status = "NO_PRAZO" | "COM_ATRASO" | "SEM_ATENDIMENTO" | "A_VENCER"

interface Agente {
  id: string
  nome: string
  departamento: string | null
  total: number
  noPrazo: number
  comAtraso: number
  semAtendimento: number
  aVencer: number
  pontualidade: number | null
  atrasoMedioMin: number | null
  suspeitos: number
}
interface Item {
  id: string
  agenteId: string
  agente: string
  contactId: string
  cliente: string
  empresa: string | null
  combinado: string
  atendidoEm: string | null
  via: "chat" | "marcado" | null
  status: Status
  atrasoMin: number
  texto: string
  suspeito: boolean
}
interface MsgConversa { id: string; tipo: "cliente" | "robo" | "equipe" | "sistema"; quem: string; texto: string; em: string; naoConta: string | null; contou: boolean }
interface Conversa { agente: string; combinado: string; criadoEm: string; feitoEm: string | null; mensagens: MsgConversa[] }
interface Dados {
  dias: number
  geral: { total: number; noPrazo: number; comAtraso: number; semAtendimento: number; aVencer: number; pontualidade: number | null }
  agentes: Agente[]
  itens: Item[]
  truncado: boolean
}

// Cores de status (fixas, com ícone + nome: a cor nunca fala sozinha).
const STATUS: Record<Status, { rotulo: string; cor: string; icone: string; textoNaCor: string; campo: keyof Agente }> = {
  NO_PRAZO: { rotulo: "No prazo", cor: "#0ca30c", icone: "✓", textoNaCor: "#ffffff", campo: "noPrazo" },
  COM_ATRASO: { rotulo: "Atendeu com atraso", cor: "#fab219", icone: "!", textoNaCor: "#0b0b0b", campo: "comAtraso" },
  SEM_ATENDIMENTO: { rotulo: "Sem atendimento", cor: "#d03b3b", icone: "✕", textoNaCor: "#ffffff", campo: "semAtendimento" },
  A_VENCER: { rotulo: "A vencer", cor: "#c3c2b7", icone: "◷", textoNaCor: "#0b0b0b", campo: "aVencer" },
}
const ORDEM: Status[] = ["NO_PRAZO", "COM_ATRASO", "SEM_ATENDIMENTO", "A_VENCER"]

const FUSO = "America/Sao_Paulo"
const diaHora = (iso: string) => {
  const d = new Date(iso)
  const dia = d.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "")
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })
  return `${dia} ${hora}`
}
const horaSeg = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", second: "2-digit" })
const duracao = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`)

function Selo({ s }: Readonly<{ s: Status }>) {
  const m = STATUS[s]
  return (
    <span aria-hidden className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none" style={{ background: m.cor, color: m.textoNaCor }}>
      {m.icone}
    </span>
  )
}

function textoResultado(i: Item): string {
  if (i.status === "NO_PRAZO") return i.atendidoEm ? `atendeu às ${horaSeg(i.atendidoEm)} (${i.via === "marcado" ? "marcou feito" : "respondeu no chat"})` : ""
  if (i.status === "COM_ATRASO") return `atendeu ${duracao(i.atrasoMin)} depois (${horaSeg(i.atendidoEm ?? i.combinado)}, ${i.via === "marcado" ? "marcou feito" : "chat"})`
  if (i.status === "SEM_ATENDIMENTO") return `esperando há ${duracao(i.atrasoMin)}`
  return "ainda não venceu"
}

const COR_QUEM: Record<MsgConversa["tipo"], string> = { cliente: "#52514e", robo: "#0b3f8a", equipe: "#006300", sistema: "#898781" }

function PainelConversa({ dado }: Readonly<{ dado: Conversa | "carregando" | "erro" | undefined }>) {
  if (!dado || dado === "carregando") return <p className="mt-2 text-[12px] text-zinc-400">Carregando a conversa…</p>
  if (dado === "erro") return <p className="mt-2 text-[12px] font-medium text-red-600">⚠️ Não foi possível carregar a conversa.</p>
  const temEquipe = dado.mensagens.some((m) => m.tipo === "equipe" && !m.naoConta)
  return (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="mb-2 text-[11.5px] text-zinc-500">
        Combinado {diaHora(dado.combinado)} com {dado.agente}
        {dado.feitoEm ? ` · marcou "Fiz o retorno" às ${horaSeg(dado.feitoEm)}` : ""}
        {!temEquipe && !dado.feitoEm ? " · nenhuma resposta da equipe ao cliente" : ""}
      </p>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {dado.mensagens.map((m) => (
          <li key={m.id} className={`rounded-lg px-2.5 py-1.5 text-[12px] leading-snug ${m.contou ? "bg-emerald-100 ring-1 ring-emerald-400" : m.naoConta ? "bg-zinc-100 opacity-70" : "bg-white"}`}>
            <span className="mr-1.5 font-semibold" style={{ color: COR_QUEM[m.tipo] }}>{m.quem}</span>
            <span className="mr-1.5 text-[11px] text-zinc-400">{horaSeg(m.em)}</span>
            <span className="text-zinc-800">{m.texto || "(sem texto)"}</span>
            {m.contou && <span className="ml-2 font-semibold text-emerald-700">← contou como atendimento</span>}
            {m.naoConta && <span className="ml-2 text-[11px] font-semibold text-zinc-500">(não conta: {m.naoConta})</span>}
          </li>
        ))}
        {dado.mensagens.length === 0 && <li className="text-[12px] text-zinc-400">Nenhuma mensagem encontrada.</li>}
      </ul>
    </div>
  )
}

export default function RetornosDashboard() {
  const [dias, setDias] = useState(7)
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState("")
  const [atualizadoEm, setAtualizadoEm] = useState("")
  const [filtroStatus, setFiltroStatus] = useState<Status | "TODOS">("TODOS")
  const [filtroAgente, setFiltroAgente] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState(40)
  const [aberta, setAberta] = useState<string | null>(null)
  const [conversas, setConversas] = useState<Record<string, Conversa | "carregando" | "erro">>({})

  const carregar = useCallback(async (d: number) => {
    try {
      const res = await fetch(`/api/admin/retornos-dashboard?dias=${d}`, { cache: "no-store" })
      if (!res.ok) throw new Error("falhou")
      setDados((await res.json()) as Dados)
      setErro("")
      setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }))
    } catch {
      setErro("Não foi possível carregar os retornos. Confira a internet e tente de novo.")
    }
  }, [])

  useEffect(() => {
    void (async () => { await carregar(dias) })()
    const timer = setInterval(() => void carregar(dias), 60_000)
    return () => clearInterval(timer)
  }, [dias, carregar])

  // "Ver conversa": abre as mensagens por trás do retorno pra conferir.
  const alternarConversa = async (id: string) => {
    if (aberta === id) { setAberta(null); return }
    setAberta(id)
    if (conversas[id] && conversas[id] !== "erro") return
    setConversas((c) => ({ ...c, [id]: "carregando" }))
    try {
      const res = await fetch(`/api/admin/retornos-dashboard/conversa?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      if (!res.ok) throw new Error("falhou")
      const dados = (await res.json()) as Conversa
      setConversas((c) => ({ ...c, [id]: dados }))
    } catch {
      setConversas((c) => ({ ...c, [id]: "erro" }))
    }
  }

  const trocarPeriodo = (d: number) => { setDados(null); setDias(d); setMostrar(40) }

  const itens = (dados?.itens ?? []).filter((i) =>
    (filtroStatus === "TODOS" || i.status === filtroStatus) && (!filtroAgente || i.agenteId === filtroAgente))
  const agenteFiltrado = dados?.agentes.find((a) => a.id === filtroAgente)

  return (
    <main className="min-h-full bg-zinc-50 font-sans" style={{ ["--ink" as string]: "#0b0b0b", ["--ink2" as string]: "#52514e", ["--muted" as string]: "#898781" }}>
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900 md:text-2xl">Retornos da equipe</h1>
            <p className="mt-0.5 max-w-2xl text-[12.5px] text-zinc-500">
              Quem está respeitando o horário combinado com o cliente. Vale o retorno que o atendente virtual agendou:
              respeitou quem atendeu até 30 minutos depois do horário, respondendo no chat ou marcando &ldquo;Fiz o retorno&rdquo;.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {atualizadoEm && <span className="text-[11.5px] text-zinc-400">Atualizado às {atualizadoEm}</span>}
            <div role="group" aria-label="Período" className="inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-0.5">
              {[{ d: 1, r: "Hoje" }, { d: 7, r: "7 dias" }, { d: 30, r: "30 dias" }].map((p) => (
                <button
                  key={p.d}
                  type="button"
                  onClick={() => trocarPeriodo(p.d)}
                  aria-pressed={dias === p.d}
                  className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold ${dias === p.d ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
                >
                  {p.r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8">
        {erro && (
          <p role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">
            <span>⚠️ {erro}</span>
            <button type="button" onClick={() => void carregar(dias)} className="rounded-lg bg-red-700 px-3 py-1 text-[12px] font-semibold text-white hover:bg-red-800">Tentar de novo</button>
          </p>
        )}

        {!dados && !erro && <p className="py-16 text-center text-[13px] text-zinc-400">Carregando…</p>}

        {dados && dados.geral.total === 0 && (
          <section className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-6 py-14 text-center">
            <Mascote className="h-24 w-24 rounded-3xl" humor="dormindo" />
            <p className="text-[14px] font-semibold text-zinc-800">Nenhum retorno agendado pelo atendente virtual neste período</p>
            <p className="max-w-md text-[12.5px] text-zinc-500">Quando o robô atender um cliente fora do horário e combinar o retorno, ele aparece aqui.</p>
          </section>
        )}

        {dados && dados.geral.total > 0 && (
          <>
            {/* Resumo: número principal + os quatro estados (clicáveis) */}
            <section className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-5">
                <p className="text-[12px] font-medium text-zinc-500">Pontualidade da equipe</p>
                <p className="mt-1 text-5xl font-semibold tracking-tight text-zinc-900">
                  {dados.geral.pontualidade === null ? "—" : `${dados.geral.pontualidade}%`}
                </p>
                <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">
                  {dados.geral.pontualidade === null
                    ? "Ainda não venceu nenhum retorno neste período."
                    : `${dados.geral.noPrazo} de ${dados.geral.noPrazo + dados.geral.comAtraso + dados.geral.semAtendimento} retornos vencidos foram atendidos no horário.`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {ORDEM.map((s) => {
                  const m = STATUS[s]
                  const ativo = filtroStatus === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setFiltroStatus(ativo ? "TODOS" : s); setMostrar(40) }}
                      aria-pressed={ativo}
                      className={`rounded-2xl border bg-white p-4 text-left transition hover:border-zinc-300 ${ativo ? "border-zinc-900 ring-1 ring-zinc-900" : "border-zinc-200"}`}
                    >
                      <span className="flex items-center gap-2 text-[12px] font-medium text-zinc-600"><Selo s={s} />{m.rotulo}</span>
                      <span className="mt-2 block text-3xl font-semibold tracking-tight text-zinc-900">{dados.geral[m.campo as "noPrazo"]}</span>
                    </button>
                  )
                })}
              </div>
            </section>

            {/* Por agente */}
            <section className="rounded-2xl border border-zinc-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-5 py-3">
                <h2 className="text-[14px] font-semibold text-zinc-900">Por agente</h2>
                <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Legenda">
                  {ORDEM.map((s) => (
                    <li key={s} className="flex items-center gap-1.5 text-[11.5px] text-zinc-600"><Selo s={s} />{STATUS[s].rotulo}</li>
                  ))}
                </ul>
              </div>
              <ul className="divide-y divide-zinc-100">
                {dados.agentes.map((a) => {
                  const ativo = filtroAgente === a.id
                  return (
                    <li key={a.id} className={ativo ? "bg-zinc-50" : ""}>
                      <div className="px-5 py-3.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => { setFiltroAgente(ativo ? null : a.id); setMostrar(40) }}
                            aria-pressed={ativo}
                            className="min-w-0 truncate text-left text-[13.5px] font-semibold text-zinc-900 hover:underline"
                          >
                            {a.nome}
                            {a.departamento && <span className="ml-2 text-[11px] font-normal text-zinc-400">{a.departamento.replaceAll("_", " ").toLowerCase()}</span>}
                          </button>
                          <span className="shrink-0 text-[13px] text-zinc-500">
                            pontualidade <strong className="text-[15px] font-semibold text-zinc-900">{a.pontualidade === null ? "—" : `${a.pontualidade}%`}</strong>
                          </span>
                        </div>
                        <div className="mt-2 flex h-3.5 gap-[2px] overflow-hidden rounded-[4px] bg-white" role="img" aria-label={`${a.nome}: ${ORDEM.map((s) => `${a[STATUS[s].campo as "noPrazo"]} ${STATUS[s].rotulo.toLowerCase()}`).join(", ")}`}>
                          {ORDEM.map((s) => {
                            const n = a[STATUS[s].campo as "noPrazo"]
                            if (n === 0) return null
                            return (
                              <button
                                key={s}
                                type="button"
                                title={`${STATUS[s].rotulo}: ${n} de ${a.total}`}
                                aria-label={`${STATUS[s].rotulo}: ${n}`}
                                onClick={() => { setFiltroAgente(a.id); setFiltroStatus(s); setMostrar(40) }}
                                className="h-full min-w-[6px] hover:opacity-80"
                                style={{ flexGrow: n, background: STATUS[s].cor }}
                              />
                            )
                          })}
                        </div>
                        <p className="mt-1.5 text-[11.5px] text-zinc-500">
                          {a.total} {a.total === 1 ? "retorno" : "retornos"}
                          {" · "}{a.noPrazo} no prazo
                          {a.comAtraso > 0 && ` · ${a.comAtraso} com atraso${a.atrasoMedioMin !== null ? ` (em média ${duracao(a.atrasoMedioMin)} depois)` : ""}`}
                          {a.semAtendimento > 0 && ` · ${a.semAtendimento} sem atendimento`}
                          {a.aVencer > 0 && ` · ${a.aVencer} a vencer`}
                        </p>
                        {a.suspeitos > 0 && (
                          <p className="mt-1 text-[11.5px] font-semibold text-amber-700">⚠ {a.suspeitos} {a.suspeitos === 1 ? "retorno atendido" : "retornos atendidos"} no mesmo minuto — confira na lista abaixo</p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* Lista */}
            <section className="rounded-2xl border border-zinc-200 bg-white">
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-5 py-3">
                <h2 className="mr-2 text-[14px] font-semibold text-zinc-900">Retornos</h2>
                {(["TODOS", ...ORDEM] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setFiltroStatus(s); setMostrar(40) }}
                    aria-pressed={filtroStatus === s}
                    className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${filtroStatus === s ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}
                  >
                    {s === "TODOS" ? "Todos" : STATUS[s].rotulo}
                  </button>
                ))}
                {agenteFiltrado && (
                  <button type="button" onClick={() => setFiltroAgente(null)} className="rounded-full bg-zinc-100 px-3 py-1 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-200">
                    {agenteFiltrado.nome} ✕
                  </button>
                )}
              </div>
              {itens.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-zinc-400">Nenhum retorno com esse filtro.</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {itens.slice(0, mostrar).map((i) => (
                    <li key={i.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3">
                      <span className="mt-0.5"><Selo s={i.status} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-zinc-900">
                          <a href={`/admin/chats?contact=${i.contactId}`} className="font-semibold underline-offset-2 hover:underline">{i.cliente}</a>
                          {i.empresa && <span className="text-zinc-400"> · {i.empresa}</span>}
                          <span className="text-zinc-500"> · {i.agente}</span>
                        </p>
                        <p className="text-[12px] text-zinc-500">
                          combinado {diaHora(i.combinado)} · <span className="font-medium text-zinc-700">{STATUS[i.status].rotulo}</span>, {textoResultado(i)}
                        </p>
                        {i.texto && <p className="mt-0.5 truncate text-[12px] italic text-zinc-400">resposta: &ldquo;{i.texto}&rdquo;</p>}
                        {i.suspeito && <p className="mt-0.5 text-[11.5px] font-semibold text-amber-700">⚠ vários retornos atendidos no mesmo minuto por {i.agente} — confira se foi atendimento de verdade</p>}
                        <button type="button" onClick={() => void alternarConversa(i.id)} aria-expanded={aberta === i.id} className="mt-1 text-[12px] font-semibold text-[#002d6b] underline-offset-2 hover:underline">
                          {aberta === i.id ? "Esconder conversa" : "Ver conversa"}
                        </button>
                        {aberta === i.id && <PainelConversa dado={conversas[i.id]} />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {itens.length > mostrar && (
                <div className="border-t border-zinc-100 px-5 py-3 text-center">
                  <button type="button" onClick={() => setMostrar((m) => m + 40)} className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold text-zinc-700 hover:bg-zinc-100">
                    Mostrar mais ({itens.length - mostrar})
                  </button>
                </div>
              )}
              {dados.truncado && <p className="border-t border-zinc-100 px-5 py-2 text-[11.5px] text-zinc-400">Mostrando os 400 retornos mais recentes do período.</p>}
            </section>
          </>
        )}
      </div>
    </main>
  )
}

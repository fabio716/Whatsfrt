"use client"

import { useEffect, useState, type ReactNode } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// Relatório de atendimento por dia.
//
// Os números vêm todos de GET /api/reports/daily — os mesmos que vão pro
// WhatsApp às 18h. Nada é calculado aqui, pra tela e mensagem nunca
// divergirem.
//
// Feito em cartões e não em tabela de propósito: a equipe abre isso no
// celular, e tabela de 9 colunas não caberia. Em tela grande os cartões se
// distribuem em colunas.
// ═══════════════════════════════════════════════════════════════════════════

interface Vendedora {
  id: string
  nome: string
  atendimentos: number
  respostas: number
  mediaSeg: number | null
  medianaSeg: number | null
  lentas: number
  conversas: number
  mensagens: number
  comTroca: number
  notas: number
  notaMedia: number | null
  notasBaixas: number
}

type TipoPeriodo = "dia" | "semana" | "mes"

interface CasoLento {
  contactId: string
  cliente: string
  vendedora: string
  clienteEm: string
  respostaEm: string | null
  esperaSeg: number
  pergunta: string
}

interface Totais {
  atendimentos: number
  conversas: number
  mensagens: number
  respostas: number
  mediaSeg: number | null
  lentas: number
  notas: number
  notaMedia: number | null
  notasBaixas: number
}

interface Relatorio {
  dia: string
  periodo: {
    tipo: TipoPeriodo
    de: string
    ate: string
    rotulo: string
    emAndamento: boolean
  }
  anterior: Totais | null
  totais: {
    atendimentos: number
    conversas: number
    mensagens: number
    respostas: number
    mediaSeg: number | null
    lentas: number
    notas: number
    notaMedia: number | null
    notasBaixas: number
  }
  vendedoras: Vendedora[]
}

function duracao(seg: number | null): string {
  if (seg === null) return "—"
  if (seg < 60) return `${seg}s`
  const min = Math.floor(seg / 60)
  const resto = seg % 60
  if (min < 60) return resto === 0 ? `${min}min` : `${min}min${String(resto).padStart(2, "0")}`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`
}

const numero = (n: number) => n.toLocaleString("pt-BR")
const decimal = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Data de hoje no Brasil (o navegador pode estar em outro fuso). */
function hoje(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** Anda no calendário a partir de AAAA-MM-DD, em UTC (conta de dia, sem fuso). */
function andar(dia: string, tipo: TipoPeriodo, passo: 1 | -1): string {
  const d = new Date(`${dia}T00:00:00Z`)
  if (tipo === "mes") d.setUTCMonth(d.getUTCMonth() + passo)
  else d.setUTCDate(d.getUTCDate() + (tipo === "semana" ? 7 * passo : passo))
  return d.toISOString().slice(0, 10)
}

// Variação contra o período anterior equivalente.
// `menorEhMelhor` inverte a cor: cair no tempo de resposta é bom.
function Variacao({ atual, antes, menorEhMelhor }: Readonly<{
  atual: number | null
  antes: number | null | undefined
  menorEhMelhor?: boolean
}>) {
  if (atual === null || antes === null || antes === undefined) return null
  if (antes === 0) {
    // Sem base de comparação: mostrar "+∞%" não informa nada.
    return atual > 0 ? <span className="text-[11.5px] text-zinc-400">novo</span> : null
  }
  const pct = Math.round(((atual - antes) / antes) * 100)
  if (pct === 0) return <span className="text-[11.5px] text-zinc-400">igual</span>
  const subiu = pct > 0
  const bom = menorEhMelhor ? !subiu : subiu
  return (
    <span className={`text-[11.5px] font-medium tabular-nums ${bom ? "text-emerald-600" : "text-amber-600"}`}>
      <span aria-hidden="true">{subiu ? "↑" : "↓"} </span>
      {Math.abs(pct)}%
      <span className="sr-only">{subiu ? " acima" : " abaixo"} do período anterior</span>
    </span>
  )
}

function Total({ rotulo, valor, detalhe, alerta, variacao }: Readonly<{
  rotulo: string
  valor: ReactNode
  detalhe?: string
  alerta?: boolean
  variacao?: ReactNode
}>) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{rotulo}</p>
        {variacao}
      </div>
      <p className={`mt-2 text-[26px] font-medium leading-none tracking-tight tabular-nums ${alerta ? "text-amber-600" : "text-zinc-900"}`}>
        {valor}
      </p>
      {detalhe && <p className="mt-1.5 text-[11.5px] text-zinc-500">{detalhe}</p>}
    </div>
  )
}

function Metrica({ rotulo, valor, alerta }: Readonly<{ rotulo: string; valor: ReactNode; alerta?: boolean }>) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wide text-zinc-400">{rotulo}</dt>
      <dd className={`mt-0.5 text-[15px] font-medium tabular-nums ${alerta ? "text-amber-600" : "text-zinc-800"}`}>{valor}</dd>
    </div>
  )
}

// Escapa texto que vai pro HTML do PDF. O nome do cliente e o que ele
// escreveu vêm de fora — jogar isso cru em innerHTML seria abrir a porta.
function esc(t: string): string {
  return t.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ))
}

/**
 * Abre uma janela com a versão impressa e chama a impressão do navegador.
 * O próprio navegador oferece "Salvar como PDF" — assim não entra dependência
 * nova no projeto nem trabalho de gerar PDF no servidor.
 */
function imprimirCasos(titulo: string, periodo: string, casos: CasoLento[], mostrarVendedora: boolean): void {
  const linhas = casos.map((c) => `
    <tr>
      <td class="cliente">${esc(c.cliente)}${mostrarVendedora ? `<span class="vend">${esc(c.vendedora)}</span>` : ""}</td>
      <td class="espera ${c.respostaEm ? "" : "sem"}">${c.respostaEm ? esc(duracao(c.esperaSeg)) : "sem resposta"}</td>
      <td class="quando">
        ${new Date(c.clienteEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        ${c.respostaEm ? `<span class="resp">respondido ${new Date(c.respostaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>` : `<span class="resp">ninguém respondeu</span>`}
      </td>
      <td class="msg">${esc(c.pergunta)}</td>
    </tr>`).join("")

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>
  @page { margin: 16mm; }
  body { font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif; color: #18181b; margin: 0; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #71717a; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .08em;
       color: #71717a; border-bottom: 1px solid #d4d4d8; padding: 0 8px 6px 0; }
  td { padding: 8px 8px 8px 0; border-bottom: 1px solid #f4f4f5; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .cliente { font-weight: 600; width: 27%; }
  .vend { display: block; font-weight: 400; font-size: 10px; color: #71717a; }
  .espera { width: 13%; font-weight: 600; color: #b45309; white-space: nowrap; }
  .espera.sem { color: #dc2626; }
  .quando { width: 22%; color: #52525b; font-size: 10.5px; }
  .resp { display: block; color: #a1a1aa; }
  .msg { color: #3f3f46; }
  .rodape { margin-top: 20px; font-size: 10px; color: #71717a; line-height: 1.6; border-top: 1px solid #e4e4e7; padding-top: 10px; }
</style></head><body>
<h1>Clientes que esperaram mais de 1 hora</h1>
<p class="sub">${esc(titulo)} &middot; ${esc(periodo)} &middot; gerado em ${new Date().toLocaleString("pt-BR")}</p>
<table>
  <thead><tr><th>Cliente</th><th>Esperou</th><th>Quando</th><th>O que o cliente perguntou</th></tr></thead>
  <tbody>${linhas}</tbody>
</table>
<p class="rodape">
  O tempo conta da mensagem do cliente até a primeira resposta nossa.
  &ldquo;Sem resposta&rdquo; é o cliente que escreveu e não foi atendido até o fim do período.<br>
  Relatório gerado pelo WhatsFRT.
</p>
</body></html>`

  const janela = window.open("", "_blank", "width=900,height=700")
  if (!janela) {
    alert("O navegador bloqueou a janela. Libere os pop-ups deste site para gerar o PDF.")
    return
  }
  janela.document.write(html)
  janela.document.close()
  // Espera o conteúdo assentar antes de abrir a caixa de impressão.
  janela.setTimeout(() => janela.print(), 300)
}

export default function RelatorioClient() {
  const [dia, setDia] = useState(hoje)
  const [periodo, setPeriodo] = useState<TipoPeriodo>("dia")
  // Quem esperou demais. `null` = painel fechado. O filtro guarda o id da
  // vendedora (ou "" pra empresa inteira) e o nome só pra mostrar no título.
  const [lentas, setLentas] = useState<{ agentId: string; nome: string } | null>(null)
  const [casos, setCasos] = useState<CasoLento[] | null>(null)

  // Limpa a lista ao abrir: trocando de vendedora com o painel aberto, os
  // casos da anterior não podem ficar na tela por um instante.
  // Envio do "pedir explicação": null = parado, "enviando", ou o resultado.
  const [pedindo, setPedindo] = useState<"parado" | "enviando" | "enviado" | "erro">("parado")

  const abrirLentas = (agentId: string, nome: string) => {
    setPedindo("parado")
    setCasos(null)
    setLentas({ agentId, nome })
  }
  const [dados, setDados] = useState<Relatorio | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      // As trocas de estado ficam DENTRO da função assíncrona: chamar
      // setState direto no corpo do efeito dispara renderização em cascata
      // (e o lint do Next reprova, com razão).
      setCarregando(true)
      setErro(null)
      try {
        const res = await fetch(`/api/reports/daily?dia=${dia}&periodo=${periodo}`, { cache: "no-store" })
        if (!vivo) return
        if (!res.ok) {
          setErro(res.status === 403 ? "Só o administrador vê este relatório." : "Não foi possível carregar o relatório.")
          setDados(null)
          return
        }
        const json = (await res.json()) as Relatorio
        if (vivo) setDados(json)
      } catch {
        if (vivo) setErro("Não foi possível carregar o relatório.")
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [dia, periodo])

  // Busca os casos concretos quando o painel abre.
  useEffect(() => {
    // Fechado: nada a buscar. A lista antiga não incomoda porque o painel
    // está escondido, e abrirLentas() limpa antes de abrir de novo.
    if (!lentas) return
    let vivo = true
    void (async () => {
      try {
        const alvo = lentas.agentId ? `&agente=${encodeURIComponent(lentas.agentId)}` : ""
        const res = await fetch(`/api/reports/slow?dia=${dia}&periodo=${periodo}${alvo}`, { cache: "no-store" })
        if (!vivo) return
        const json = res.ok ? ((await res.json()) as { casos: CasoLento[] }) : { casos: [] }
        if (vivo) setCasos(json.casos)
      } catch {
        if (vivo) setCasos([])
      }
    })()
    return () => { vivo = false }
  }, [lentas, dia, periodo])

  const t = dados?.totais

  return (
    <main className="min-h-full bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">📊 Relatório de atendimento</h1>
        <p className="mt-0.5 max-w-2xl text-[12.5px] text-zinc-500">
          Os mesmos números que chegam no WhatsApp às 18h. Escolha o dia, a semana ou o mês.
        </p>

        {/* Dia / Semana / Mês */}
        <div className="mt-4 inline-flex rounded-xl border border-zinc-200 bg-white p-0.5">
          {([["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"]] as Array<[TipoPeriodo, string]>).map(([valor, texto]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setPeriodo(valor)}
              aria-pressed={periodo === valor}
              className={`min-h-8 rounded-[10px] px-3.5 text-[12.5px] font-semibold transition-colors ${
                periodo === valor ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {texto}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDia(andar(dia, periodo, -1))}
              aria-label="Período anterior"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => { const p = andar(dia, periodo, 1); if (p <= hoje()) setDia(p) }}
              disabled={andar(dia, periodo, 1) > hoje()}
              aria-label="Período seguinte"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Qual período está na tela. Sem isso, "Semana" com uma data solta
              no seletor não diz de quando até quando o número é. */}
          <p className="text-[13px] font-semibold capitalize text-zinc-800">
            {dados?.periodo?.rotulo ?? "…"}
            {dados?.periodo?.emAndamento && (
              <span className="ml-1.5 font-normal text-zinc-400">(em andamento)</span>
            )}
          </p>

          <span className="mx-1 hidden h-5 w-px bg-zinc-200 sm:block" />

          <input
            type="date"
            value={dia}
            max={hoje()}
            onChange={(e) => { if (e.target.value) setDia(e.target.value) }}
            aria-label={periodo === "dia" ? "Dia do relatório" : "Data de referência do período"}
            className="min-h-9 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] text-zinc-700 outline-none focus:border-zinc-400"
          />
          <button
            type="button"
            onClick={() => setDia(hoje())}
            disabled={dia === hoje()}
            className="min-h-9 rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            {periodo === "dia" ? "Hoje" : periodo === "semana" ? "Esta semana" : "Este mês"}
          </button>
        </div>
      </header>

      <div className="px-4 py-6 md:px-8">
        {erro && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">{erro}</p>
        )}

        {carregando && !erro && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-zinc-100" />
            ))}
          </div>
        )}

        {!carregando && !erro && dados && t && (
          dados.vendedoras.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
              <p className="text-[13.5px] font-medium text-zinc-700">Nenhum atendimento neste dia.</p>
              <p className="mt-1 text-[12px] text-zinc-500">
                Fim de semana, feriado ou dia sem movimento — nada foi registrado.
              </p>
            </div>
          ) : (
            <>
              {/* ── Totais da empresa ── */}
              <section aria-label="Totais da empresa" className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Total
                  rotulo="Atendimentos"
                  valor={numero(t.atendimentos)}
                  detalhe={`${numero(t.conversas)} conversas`}
                  variacao={<Variacao atual={t.atendimentos} antes={dados.anterior?.atendimentos} />}
                />
                <Total
                  rotulo="Mensagens"
                  valor={numero(t.mensagens)}
                  detalhe={t.conversas > 0 ? `${decimal(t.mensagens / t.conversas)} por conversa` : undefined}
                  variacao={<Variacao atual={t.mensagens} antes={dados.anterior?.mensagens} />}
                />
                <Total
                  rotulo="Resposta média"
                  valor={duracao(t.mediaSeg)}
                  detalhe={`${numero(t.respostas)} respostas`}
                  variacao={<Variacao atual={t.mediaSeg} antes={dados.anterior?.mediaSeg} menorEhMelhor />}
                />
                <Total
                  rotulo="Avaliação"
                  valor={t.notas > 0 ? `${decimal(t.notaMedia ?? 0)}` : "—"}
                  detalhe={t.notas > 0 ? `${numero(t.notas)} ${t.notas === 1 ? "nota" : "notas"}${t.notasBaixas > 0 ? ` · ${t.notasBaixas} abaixo de 4` : ""}` : "nenhuma nota"}
                  variacao={<Variacao atual={t.notaMedia} antes={dados.anterior?.notaMedia} />}
                />
              </section>

              {dados.anterior && (
                <p className="mt-3 text-[11.5px] text-zinc-500">
                  As setas comparam com {dados.periodo.tipo === "dia" ? "o dia anterior"
                    : dados.periodo.tipo === "semana" ? "a semana anterior" : "o mês anterior"}
                  {dados.periodo.emAndamento && <> — e só com o <strong className="font-semibold">mesmo tempo decorrido</strong>, para período em andamento não parecer pior do que é</>}.
                </p>
              )}

              {t.lentas > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
                  <p className="text-[12.5px] text-amber-800">
                    ⚠️ {numero(t.lentas)} {t.lentas === 1 ? "cliente esperou" : "clientes esperaram"} mais de 1 hora.
                  </p>
                  <button
                    type="button"
                    onClick={() => abrirLentas("", "toda a equipe")}
                    className="min-h-8 shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-amber-700"
                  >
                    Ver quem esperou
                  </button>
                </div>
              )}

              {/* ── Por vendedora ── */}
              <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Por vendedora</h2>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {dados.vendedoras.map((v) => {
                  const troca = v.conversas > 0 ? Math.round((v.comTroca / v.conversas) * 100) : 0
                  const porConversa = v.conversas > 0 ? decimal(v.mensagens / v.conversas) : "0"
                  return (
                    <article key={v.id} className="rounded-2xl border border-zinc-200 bg-white p-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="truncate text-[14px] font-semibold text-zinc-900">{v.nome}</h3>
                        <span className="shrink-0 text-[12px] text-zinc-500 tabular-nums">
                          {v.atendimentos} {v.atendimentos === 1 ? "atend." : "atend."}
                        </span>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
                        <Metrica rotulo="Conversas" valor={numero(v.conversas)} />
                        <Metrica rotulo="Msg por conversa" valor={porConversa} />
                        <Metrica rotulo="Com troca" valor={`${troca}%`} />
                        <Metrica rotulo="Resposta média" valor={duracao(v.mediaSeg)} />
                        <Metrica rotulo="Metade em até" valor={duracao(v.medianaSeg)} />
                        <Metrica
                          rotulo="Acima de 1h"
                          valor={v.lentas === 0 ? "nenhuma" : (
                            <button
                              type="button"
                              onClick={() => abrirLentas(v.id, v.nome)}
                              className="rounded underline decoration-amber-300 decoration-2 underline-offset-2 hover:decoration-amber-500"
                            >
                              {numero(v.lentas)} <span className="text-[11px] font-normal">ver quais</span>
                            </button>
                          )}
                          alerta={v.lentas > 0}
                        />
                      </dl>

                      <p className="mt-4 border-t border-zinc-100 pt-3 text-[12px] text-zinc-600">
                        {v.notas > 0 ? (
                          <>
                            Nota <strong className="font-semibold text-zinc-900">{decimal(v.notaMedia ?? 0)}</strong> de 5
                            {" "}({v.notas})
                            {v.notasBaixas > 0 && <span className="text-amber-700"> · {v.notasBaixas} abaixo de 4</span>}
                          </>
                        ) : (
                          <span className="text-zinc-400">Nenhuma nota neste dia.</span>
                        )}
                      </p>
                    </article>
                  )
                })}
              </div>

              {/* ── O que cada coisa quer dizer ── */}
              <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Como ler</h2>
                <dl className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed">
                  <div>
                    <dt className="inline font-semibold text-zinc-800">Resposta média: </dt>
                    <dd className="inline text-zinc-600">
                      tempo entre a mensagem do cliente e a primeira resposta. Mensagens seguidas da vendedora não
                      contam como nova espera. Acima de 1 hora sai da média e vira &ldquo;acima de 1h&rdquo;, senão uma
                      conversa retomada no dia seguinte estragaria o número do dia.
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-zinc-800">Com troca: </dt>
                    <dd className="inline text-zinc-600">
                      conversas com pelo menos 2 mensagens de cada lado. Separa quem conversa de verdade de quem
                      responde uma linha e abandona.
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-zinc-800">Conversas: </dt>
                    <dd className="inline text-zinc-600">
                      clientes com quem ela trocou mensagem no dia. Se duas vendedoras falaram com o mesmo cliente, a
                      conversa conta para as duas — as duas trabalharam nela.
                    </dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-zinc-800">Média da empresa: </dt>
                    <dd className="inline text-zinc-600">
                      ponderada pelo número de respostas. Quem deu 200 respostas pesa mais que quem deu 3.
                    </dd>
                  </div>
                </dl>
              </section>
            </>
          )
        )}
      </div>

      {/* ─── Quem esperou demais ───────────────────────────────────────────
          É aqui que o relatório vira ação: cada linha é um atendimento
          concreto, com link pra abrir a conversa e ver o que aconteceu. */}
      {lentas && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setLentas(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="border-b border-zinc-100 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-zinc-900">
                    Clientes que esperaram mais de 1 hora
                  </h2>
                  <p className="mt-0.5 text-[12px] text-zinc-500">{dados?.periodo?.rotulo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLentas(null)}
                  aria-label="Fechar"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {/* Trocar de vendedora sem fechar o painel — é assim que se
                    percorre a equipe procurando onde está o problema. */}
                <select
                  value={lentas.agentId}
                  onChange={(e) => {
                    const id = e.target.value
                    const v = dados?.vendedoras.find((x) => x.id === id)
                    abrirLentas(id, id === "" ? "toda a equipe" : (v?.nome ?? "—"))
                  }}
                  aria-label="Filtrar por vendedora"
                  className="min-h-9 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] text-zinc-700 outline-none focus:border-zinc-400"
                >
                  <option value="">Toda a equipe</option>
                  {dados?.vendedoras.map((v) => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>

                {/* Só faz sentido com uma vendedora escolhida: "toda a
                    equipe" mandaria a lista dos outros pra cada uma. */}
                {lentas.agentId !== "" && (
                  <button
                    type="button"
                    disabled={!casos || casos.length === 0 || pedindo === "enviando" || pedindo === "enviado"}
                    onClick={() => void (async () => {
                      setPedindo("enviando")
                      try {
                        const res = await fetch("/api/reports/slow/ask", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ agentId: lentas.agentId, dia, periodo }),
                        })
                        setPedindo(res.ok ? "enviado" : "erro")
                      } catch {
                        setPedindo("erro")
                      }
                    })()}
                    className="min-h-9 rounded-xl bg-zinc-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
                  >
                    {pedindo === "enviando" ? "Enviando…"
                      : pedindo === "enviado" ? "✓ Enviado"
                        : `Pedir explicação`}
                  </button>
                )}

                <button
                  type="button"
                  disabled={!casos || casos.length === 0}
                  onClick={() => imprimirCasos(
                    lentas.agentId === "" ? "Toda a equipe" : lentas.nome,
                    dados?.periodo?.rotulo ?? "",
                    casos ?? [],
                    lentas.agentId === "",
                  )}
                  className="min-h-9 rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
                >
                  Baixar PDF
                </button>

                {casos && casos.length > 0 && pedindo === "parado" && (
                  <span className="text-[12px] text-zinc-500">
                    {casos.length} {casos.length === 1 ? "caso" : "casos"}
                  </span>
                )}
                {pedindo === "enviado" && (
                  <span className="text-[12px] font-medium text-emerald-700">
                    Mandei no chat interno de {lentas.nome}.
                  </span>
                )}
                {pedindo === "erro" && (
                  <span className="text-[12px] font-medium text-amber-700">
                    Não consegui enviar. Tente de novo.
                  </span>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {casos === null ? (
                <p className="px-5 py-10 text-center text-[12.5px] text-zinc-400">Carregando…</p>
              ) : casos.length === 0 ? (
                <p className="px-5 py-10 text-center text-[12.5px] text-zinc-500">
                  Nenhum cliente esperou mais de 1 hora neste período. 👏
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {casos.map((c) => (
                    <li key={`${c.contactId}-${c.clienteEm}`}>
                      <a
                        href={`/admin/chats?contact=${c.contactId}`}
                        className="block px-5 py-3.5 transition-colors hover:bg-zinc-50"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-[13.5px] font-semibold text-zinc-900">{c.cliente}</p>
                          <span className={`shrink-0 text-[12.5px] font-semibold tabular-nums ${c.respostaEm ? "text-amber-600" : "text-red-600"}`}>
                            {c.respostaEm ? duracao(c.esperaSeg) : "sem resposta"}
                          </span>
                        </div>
                        {c.pergunta && (
                          <p className="mt-1 line-clamp-2 text-[12.5px] text-zinc-600">&ldquo;{c.pergunta}&rdquo;</p>
                        )}
                        <p className="mt-1 text-[11px] text-zinc-400">
                          Cliente escreveu {new Date(c.clienteEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {c.respostaEm
                            ? ` · respondido ${new Date(c.respostaEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                            : " · ninguém respondeu"}
                          {lentas.agentId === "" && ` · ${c.vendedora}`}
                        </p>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="border-t border-zinc-100 px-5 py-3">
              <p className="text-[11.5px] text-zinc-500">
                Clique numa linha para abrir a conversa. &ldquo;Sem resposta&rdquo; é o cliente que escreveu e
                não foi atendido até o fim do período.
              </p>
            </footer>
          </div>
        </div>
      )}
    </main>
  )
}

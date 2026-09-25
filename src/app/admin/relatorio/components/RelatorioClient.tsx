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

interface Relatorio {
  dia: string
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

function ontem(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function Total({ rotulo, valor, detalhe, alerta }: Readonly<{
  rotulo: string
  valor: ReactNode
  detalhe?: string
  alerta?: boolean
}>) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{rotulo}</p>
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

export default function RelatorioClient() {
  const [dia, setDia] = useState(hoje)
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
        const res = await fetch(`/api/reports/daily?dia=${dia}`, { cache: "no-store" })
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
  }, [dia])

  const t = dados?.totais

  return (
    <main className="min-h-full bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl">📊 Relatório de atendimento</h1>
        <p className="mt-0.5 max-w-2xl text-[12.5px] text-zinc-500">
          Os mesmos números que chegam no WhatsApp às 18h. Escolha o dia para consultar.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dia}
            max={hoje()}
            onChange={(e) => { if (e.target.value) setDia(e.target.value) }}
            aria-label="Dia do relatório"
            className="min-h-9 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[12.5px] text-zinc-700 outline-none focus:border-zinc-400"
          />
          <button
            type="button"
            onClick={() => setDia(hoje())}
            className={`min-h-9 rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              dia === hoje() ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setDia(ontem())}
            className={`min-h-9 rounded-xl px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
              dia === ontem() ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Ontem
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
                />
                <Total
                  rotulo="Mensagens"
                  valor={numero(t.mensagens)}
                  detalhe={t.conversas > 0 ? `${decimal(t.mensagens / t.conversas)} por conversa` : undefined}
                />
                <Total
                  rotulo="Resposta média"
                  valor={duracao(t.mediaSeg)}
                  detalhe={`${numero(t.respostas)} respostas`}
                />
                <Total
                  rotulo="Avaliação"
                  valor={t.notas > 0 ? `${decimal(t.notaMedia ?? 0)}` : "—"}
                  detalhe={t.notas > 0 ? `${numero(t.notas)} ${t.notas === 1 ? "nota" : "notas"}${t.notasBaixas > 0 ? ` · ${t.notasBaixas} abaixo de 4` : ""}` : "nenhuma nota"}
                />
              </section>

              {t.lentas > 0 && (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
                  ⚠️ {numero(t.lentas)} {t.lentas === 1 ? "resposta levou" : "respostas levaram"} mais de 1 hora — essas
                  ficam fora da média e aparecem por vendedora abaixo.
                </p>
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
                          valor={v.lentas === 0 ? "nenhuma" : numero(v.lentas)}
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
    </main>
  )
}

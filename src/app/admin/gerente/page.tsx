"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Gerente virtual (admin) ─────────────────────────────────────────────────
// 1) Conferir retornos que a equipe marcou como feitos (canal + relato) e fechar
//    como Concluído ou Não concluído (volta para a pessoa refazer).
// 2) Ver os atrasos que o gerente virtual cobrou: cliente esperando (tolerância
//    1 min) e retorno atrasado, por pessoa, com ciência e tempo de espera.

interface Evidencia { achou: boolean; em?: string; texto?: string; motivo?: string }
interface Pendente {
  id: string; contactId: string; cliente: string; atendente: string; dueAt: string; feitoEm: string | null
  atrasoMin: number; canal: string | null; relato: string | null; nota: string; evidencia: Evidencia
}
interface Parecer { veredito: "CONCLUIDO" | "AGUARDANDO_CLIENTE" | "NAO_CONCLUIDO"; motivo: string }
interface Recente { id: string; decisao: string; em: string | null; motivo: string | null; canal: string | null; atendente: string; cliente: string }
interface Resumo { nome: string; espera: number; retorno: number; semCiencia: number; abertas: number; esperaMediaMin: number }
interface Ocorrencia { id: string; tipo: string; pessoa: string; cliente: string; desde: string; cienteAt: string | null; resolvidaEm: string | null; esperaMin: number | null; diretoriaAvisada: boolean }

const ROTULO_CANAL: Record<string, string> = { WHATSAPP: "WhatsApp", FRTWHATS: "frtwhats", TELEFONE: "Telefone", EMAIL: "E-mail" }
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default function GerentePage() {
  const [aba, setAba] = useState<"conferir" | "atrasos">("conferir")
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [recentes, setRecentes] = useState<Recente[]>([])
  const [resumo, setResumo] = useState<Resumo[]>([])
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [dias, setDias] = useState(7)
  const [erro, setErro] = useState("")
  const [ocupado, setOcupado] = useState("")
  const [recusando, setRecusando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState("")
  const [pareceres, setPareceres] = useState<Record<string, Parecer | "carregando" | "erro">>({})

  const carregar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch("/api/admin/gerente/conferencia", { cache: "no-store" }),
        fetch(`/api/admin/gerente/ocorrencias?dias=${dias}`, { cache: "no-store" }),
      ])
      if (!a.ok || !b.ok) throw new Error()
      const conf = (await a.json()) as { pendentes: Pendente[]; recentes: Recente[] }
      const oc = (await b.json()) as { resumo: Resumo[]; recentes: Ocorrencia[] }
      setPendentes(conf.pendentes); setRecentes(conf.recentes); setResumo(oc.resumo); setOcorrencias(oc.recentes); setErro("")
    } catch { setErro("Não consegui carregar. Recarregue a página.") }
  }, [dias])

  useEffect(() => {
    void (async () => { await carregar() })()
    const t = setInterval(() => void carregar(), 60_000)
    return () => clearInterval(t)
  }, [carregar])

  const pedirParecer = async (id: string) => {
    setPareceres((p) => ({ ...p, [id]: "carregando" }))
    try {
      const r = await fetch("/api/admin/gerente/parecer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      if (!r.ok) throw new Error()
      const dado = (await r.json()) as Parecer
      setPareceres((p) => ({ ...p, [id]: dado }))
    } catch { setPareceres((p) => ({ ...p, [id]: "erro" })) }
  }

  const liberar = async (id: string) => {
    if (ocupado) return
    setOcupado(id); setErro("")
    try {
      const r = await fetch("/api/admin/gerente/liberar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
      if (!r.ok) { const d = (await r.json().catch(() => ({}))) as { erro?: string }; setErro(d.erro ?? "Não foi possível liberar."); return }
      await carregar()
    } catch { setErro("Sem conexão. Tente de novo.") } finally { setOcupado("") }
  }

  const decidir = async (id: string, decisao: "CONCLUIDO" | "NAO_CONCLUIDO") => {
    if (ocupado) return
    setOcupado(id); setErro("")
    try {
      const r = await fetch("/api/admin/gerente/conferencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decisao, nota: decisao === "NAO_CONCLUIDO" ? motivo : "" }),
      })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível registrar."); return }
      setRecusando(null); setMotivo("")
      await carregar()
    } catch { setErro("Sem conexão. Tente de novo.") } finally { setOcupado("") }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="text-xl font-bold text-zinc-900">🧑‍💼 Gerente virtual</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Cobra a equipe quando o cliente espera mais de 1 minuto sem uma pessoa responder e quando um retorno agendado atrasa.
        Aqui você confere os retornos feitos e acompanha os atrasos.
      </p>

      <div className="mt-4 flex gap-2" role="tablist">
        {([["conferir", `Conferir retornos${pendentes.length ? ` (${pendentes.length})` : ""}`], ["atrasos", "Atrasos da equipe"]] as const).map(([id, rotulo]) => (
          <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
            className={`rounded-full px-4 py-1.5 text-[13px] font-semibold ${aba === id ? "bg-[#002d6b] text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"}`}>
            {rotulo}
          </button>
        ))}
      </div>
      {erro && <p role="alert" className="mt-3 text-sm font-medium text-red-600">⚠️ {erro}</p>}

      {aba === "conferir" && (
        <section className="mt-4 space-y-3">
          {pendentes.length === 0 && <p className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">Nenhum retorno aguardando conferência. 🎉</p>}
          {pendentes.map((p) => (
            <article key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-[14px] font-semibold text-zinc-900">{p.cliente} <span className="font-normal text-zinc-500">· {p.atendente}</span></p>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-bold text-zinc-700">{ROTULO_CANAL[p.canal ?? ""] ?? "—"}</span>
              </div>
              <p className="mt-1 text-[12px] text-zinc-500">
                Combinado {hora(p.dueAt)} · feito {p.feitoEm ? hora(p.feitoEm) : "—"}
                {p.atrasoMin > 5 ? <span className="font-semibold text-red-600"> · {p.atrasoMin} min depois do horário</span> : <span className="font-semibold text-emerald-700"> · no horário</span>}
              </p>
              {p.nota && <p className="mt-1 text-[12px] text-zinc-500">Combinado: {p.nota}</p>}
              <blockquote className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-800">“{p.relato}”</blockquote>
              <p className={`mt-2 text-[12px] font-medium ${p.evidencia.achou ? "text-emerald-700" : "text-amber-700"}`}>
                {p.evidencia.achou ? `✅ Achei a mensagem dela no chat (${p.evidencia.em ? hora(p.evidencia.em) : ""}): “${p.evidencia.texto}”` : `⚠️ ${p.evidencia.motivo}`}
              </p>
              {(() => {
                const par = pareceres[p.id]
                if (par === "carregando") return <p className="mt-2 text-[12px] text-zinc-500">🧑‍💼 O gerente virtual está analisando…</p>
                if (par === "erro") return <p className="mt-2 text-[12px] text-red-600">Não consegui o parecer agora. <button type="button" className="underline" onClick={() => void pedirParecer(p.id)}>Tentar de novo</button></p>
                if (par) {
                  const cor = par.veredito === "CONCLUIDO" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : par.veredito === "AGUARDANDO_CLIENTE" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900"
                  const rot = par.veredito === "CONCLUIDO" ? "✅ Sugere: Concluído" : par.veredito === "AGUARDANDO_CLIENTE" ? "⏳ Sugere: contato feito, aguardando o cliente" : "❌ Sugere: Não concluído"
                  return <div className={`mt-2 rounded-lg border px-3 py-2 text-[12.5px] ${cor}`}><b>🧑‍💼 {rot}</b><br />{par.motivo}</div>
                }
                return <button type="button" onClick={() => void pedirParecer(p.id)} className="mt-2 rounded-lg border border-[#002d6b]/30 bg-[#002d6b]/5 px-3 py-1.5 text-[12.5px] font-semibold text-[#002d6b] hover:bg-[#002d6b]/10">🧑‍💼 Pedir parecer do gerente virtual</button>
              })()}
              {recusando === p.id ? (
                <div className="mt-3 space-y-2">
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 300))} rows={2} placeholder="O que faltou? A pessoa vai ver isso." className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[13px]" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void decidir(p.id, "NAO_CONCLUIDO")} disabled={ocupado !== "" || motivo.trim().length < 5} className="rounded-lg bg-red-600 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-40">Reabrir para a pessoa refazer</button>
                    <button type="button" onClick={() => { setRecusando(null); setMotivo("") }} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[12.5px] font-semibold text-zinc-700">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void decidir(p.id, "CONCLUIDO")} disabled={ocupado !== ""} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">✅ Concluído</button>
                  <button type="button" onClick={() => { setRecusando(p.id); setMotivo("") }} disabled={ocupado !== ""} className="rounded-lg bg-red-50 px-3 py-1.5 text-[12.5px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">❌ Não concluído</button>
                  <a href={`/admin/chats?contact=${p.contactId}`} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[12.5px] font-semibold text-zinc-700 hover:bg-zinc-50">Ver conversa</a>
                </div>
              )}
            </article>
          ))}
          {recentes.length > 0 && (
            <details className="rounded-xl border border-zinc-200 p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-zinc-700">Conferidos nos últimos 7 dias ({recentes.length})</summary>
              <ul className="mt-2 space-y-1 text-[12.5px] text-zinc-700">
                {recentes.map((r) => (
                  <li key={r.id}>{r.decisao === "CONCLUIDO" ? "✅" : "❌"} {r.cliente} · {r.atendente} · {ROTULO_CANAL[r.canal ?? ""] ?? "—"}{r.motivo ? ` — ${r.motivo}` : ""}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {aba === "atrasos" && (
        <section className="mt-4">
          <div className="flex items-center gap-2 text-[13px] text-zinc-700">
            Período:
            {[1, 7, 30].map((d) => (
              <button key={d} type="button" onClick={() => setDias(d)} className={`rounded-full px-3 py-1 font-semibold ${dias === d ? "bg-[#002d6b] text-white" : "bg-zinc-100 hover:bg-zinc-200"}`}>{d === 1 ? "Hoje" : `${d} dias`}</button>
            ))}
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-zinc-50 text-[11.5px] uppercase text-zinc-500">
                <tr><th className="px-3 py-2">Pessoa</th><th className="px-3 py-2">Cliente esperando</th><th className="px-3 py-2">Retorno atrasado</th><th className="px-3 py-2">Espera média</th><th className="px-3 py-2">Sem ciência</th><th className="px-3 py-2">Em aberto</th></tr>
              </thead>
              <tbody>
                {resumo.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-zinc-500">Nenhum atraso no período. 👏</td></tr>}
                {resumo.map((r) => (
                  <tr key={r.nome} className="border-t border-zinc-100">
                    <td className="px-3 py-2 font-semibold text-zinc-900">{r.nome}</td><td className="px-3 py-2">{r.espera}</td><td className="px-3 py-2">{r.retorno}</td>
                    <td className="px-3 py-2">{r.esperaMediaMin} min</td><td className={`px-3 py-2 ${r.semCiencia ? "font-semibold text-red-600" : ""}`}>{r.semCiencia}</td><td className="px-3 py-2">{r.abertas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="mt-4 space-y-1.5 text-[12.5px] text-zinc-700">
            {ocorrencias.map((o) => (
              <li key={o.id} className="rounded-lg bg-zinc-50 px-3 py-2">
                {o.tipo === "ESPERA_CLIENTE" ? "⏱️" : "⏰"} <b>{o.pessoa}</b> · {o.cliente} · desde {hora(o.desde)}
                {o.resolvidaEm ? ` · atendido após ${o.esperaMin} min` : (
                  <>
                    <b className="text-red-600"> · ainda em aberto</b>{" "}
                    <button type="button" onClick={() => void liberar(o.id)} disabled={ocupado !== ""} className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50">Já atendido / liberar</button>
                  </>
                )}
                {o.cienteAt ? ` · ciente ${hora(o.cienteAt)}` : <b className="text-amber-700"> · sem ciência</b>}
                {o.diretoriaAvisada ? " · diretoria avisada" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

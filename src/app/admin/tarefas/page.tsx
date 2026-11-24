"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Tarefas com feedback obrigatório ───────────────────────────────────────
// Administrador cria (com prazo) e acompanha; cada pessoa dá o "ciente" e só
// conclui escrevendo o feedback. O gerente virtual cobra o atraso.

interface Tarefa {
  id: string; titulo: string; detalhes: string | null; prazoEm: string; cienteAt: string | null
  concluidaAt: string | null; feedback: string | null; criadaEm: string
  prazoProposto: string | null; justificativa: string | null; propostaStatus: string | null; notaDecisao: string | null
  paraId: string; paraNome: string; deNome: string; atrasada: boolean
}
interface Pessoa { id: string; name: string }

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

export default function TarefasPage() {
  const [ehAdmin, setEhAdmin] = useState<boolean | null>(null)
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [erro, setErro] = useState("")
  const [ok, setOk] = useState("")
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [novo, setNovo] = useState({ titulo: "", detalhes: "", paraUserId: "", prazoEm: "" })
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({})
  const [abertaId, setAbertaId] = useState<string | null>(null)

  const carregar = useCallback(async (admin: boolean) => {
    try {
      const r = await fetch(`/api/tarefas${admin ? "?todas=1" : ""}`, { cache: "no-store" })
      if (!r.ok) throw new Error()
      setTarefas(((await r.json()) as { tarefas: Tarefa[] }).tarefas)
      setErro("")
    } catch { setErro("Não consegui carregar as tarefas. Tente de novo.") }
    finally { setCarregando(false) }
  }, [])

  useEffect(() => {
    void (async () => {
      let admin = false
      try {
        const me = await fetch("/api/me", { cache: "no-store" })
        if (me.ok) admin = ((await me.json()) as { role?: string }).role === "ADMIN"
      } catch { /* sem sessão legível: cai para a visão de agente */ }
      setEhAdmin(admin)
      await carregar(admin)
      if (admin) {
        try { setPessoas((await (await fetch("/api/internal/users")).json()) as Pessoa[]) } catch { /* lista fica vazia */ }
      }
    })()
  }, [carregar])

  async function criar(e: React.FormEvent) {
    e.preventDefault()
    setErro(""); setOk(""); setEnviando(true)
    try {
      const r = await fetch("/api/tarefas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...novo, prazoEm: novo.prazoEm ? new Date(novo.prazoEm).toISOString() : "" }),
      })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível criar a tarefa."); return }
      setOk("Tarefa criada e enviada para a pessoa.")
      setNovo({ titulo: "", detalhes: "", paraUserId: "", prazoEm: "" })
      await carregar(true)
    } catch { setErro("Falha de conexão. A tarefa não foi criada.") }
    finally { setEnviando(false) }
  }

  async function agir(id: string, acao: "ciente" | "concluir") {
    setErro(""); setOk("")
    try {
      const r = await fetch(`/api/tarefas/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, feedback: feedbacks[id] ?? "" }),
      })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível salvar."); return }
      setOk(acao === "concluir" ? "Tarefa concluída. Obrigado pelo feedback!" : "Ciente registrado.")
      await carregar(Boolean(ehAdmin))
    } catch { setErro("Falha de conexão. Tente de novo.") }
  }

  async function decidir(id: string, aprovar: boolean) {
    setErro(""); setOk("")
    const nota = aprovar ? "" : (window.prompt("Observação para a pessoa (opcional):") ?? "")
    try {
      const r = await fetch(`/api/tarefas/${id}/decidir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aprovar, nota }) })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível registrar a decisão."); return }
      setOk(aprovar ? "Novo prazo aprovado." : "Prazo original mantido.")
      await carregar(true)
    } catch { setErro("Falha de conexão. Tente de novo.") }
  }

  async function cancelar(id: string) {
    if (!window.confirm("Cancelar (apagar) esta tarefa?")) return
    const r = await fetch(`/api/tarefas/${id}`, { method: "DELETE" })
    if (r.ok) await carregar(true); else setErro("Não foi possível cancelar.")
  }

  const abertas = tarefas.filter((t) => !t.concluidaAt)
  const feitas = tarefas.filter((t) => t.concluidaAt)

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-bold text-zinc-800">📝 {ehAdmin ? "Tarefas da equipe" : "Minhas tarefas"}</h1>
        <p className="text-[13px] text-zinc-500">Toda tarefa tem prazo e só é concluída com um feedback escrito do que foi feito.</p>
        {ehAdmin && <a href="/admin/tarefas/dashboard" className="mt-1 inline-block text-[13px] font-medium text-emerald-700 underline">📊 Ver dashboard das tarefas</a>}
      </div>

      {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{erro}</p>}
      {ok && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">{ok}</p>}

      {ehAdmin && (
        <form onSubmit={criar} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-[14px] font-semibold text-zinc-700">Nova tarefa</h2>
          <input value={novo.titulo} onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} maxLength={120} placeholder="O que precisa ser feito?" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" />
          <textarea value={novo.detalhes} onChange={(e) => setNovo({ ...novo, detalhes: e.target.value })} maxLength={1000} rows={3} placeholder="Detalhes (opcional)" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" />
          <div className="flex flex-wrap gap-3">
            <select value={novo.paraUserId} onChange={(e) => setNovo({ ...novo, paraUserId: e.target.value })} className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-[14px]">
              <option value="">Quem vai fazer?</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="datetime-local" value={novo.prazoEm} onChange={(e) => setNovo({ ...novo, prazoEm: e.target.value })} className="rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" aria-label="Prazo" />
          </div>
          <button disabled={enviando} className="rounded-lg bg-emerald-600 px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60">{enviando ? "Enviando…" : "Criar e enviar"}</button>
        </form>
      )}

      {carregando ? <p className="text-[13px] text-zinc-400">Carregando…</p> : (
        <>
          <section className="space-y-3">
            <h2 className="text-[14px] font-semibold text-zinc-700">Em aberto ({abertas.length})</h2>
            {abertas.length === 0 && <p className="rounded-xl bg-zinc-50 px-3 py-4 text-center text-[13px] text-zinc-400">Nenhuma tarefa em aberto. 🎉</p>}
            {abertas.map((t) => (
              <div key={t.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${t.atrasada ? "border-red-300" : "border-zinc-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-zinc-800">{t.titulo}</p>
                    <p className="text-[12px] text-zinc-500">{ehAdmin ? `Para ${t.paraNome} · ` : `De ${t.deNome} · `}prazo {quando(t.prazoEm)}{t.atrasada && <span className="ml-1 font-semibold text-red-600">· atrasada</span>}{t.cienteAt ? " · ciente ✓" : ehAdmin ? " · ainda sem ciente" : ""}</p>
                  </div>
                  {ehAdmin && <button onClick={() => void cancelar(t.id)} className="text-[12px] text-zinc-400 hover:text-red-600">Cancelar</button>}
                </div>
                {t.detalhes && <p className="mt-2 whitespace-pre-wrap text-[13px] text-zinc-600">{t.detalhes}</p>}
                {t.propostaStatus === "PENDENTE" && t.prazoProposto && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-[13px] text-amber-900">
                    🗓️ {ehAdmin ? `${t.paraNome} pediu` : "Você pediu"} novo prazo: <b>{quando(t.prazoProposto)}</b>. Motivo: {t.justificativa}
                    {ehAdmin ? (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => void decidir(t.id, true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white">Aprovar novo prazo</button>
                        <button onClick={() => void decidir(t.id, false)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700">Manter prazo original</button>
                      </div>
                    ) : <p className="mt-1 text-[12px]">Aguardando a decisão do administrador. Enquanto isso você não é cobrado por este prazo.</p>}
                  </div>
                )}
                {t.propostaStatus === "APROVADA" && <p className="mt-2 text-[12px] text-emerald-700">✅ Novo prazo aprovado. Motivo do pedido: {t.justificativa}</p>}
                {t.propostaStatus === "RECUSADA" && <p className="mt-2 text-[12px] text-zinc-500">ℹ️ Pedido de novo prazo não aprovado; vale o prazo original.{t.notaDecisao ? ` Observação: ${t.notaDecisao}` : ""}</p>}
                {!ehAdmin && !t.cienteAt && !t.propostaStatus && <p className="mt-2 text-[12px] font-medium text-amber-700">⚠️ Responda ao prazo: aceite ou proponha outro (a janela aparece na tela).</p>}
                {!ehAdmin && (
                  <div className="mt-3 space-y-2">
                    {!t.cienteAt && <button onClick={() => void agir(t.id, "ciente")} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] font-medium text-zinc-700">Estou ciente</button>}
                    {abertaId === t.id ? (
                      <>
                        <textarea value={feedbacks[t.id] ?? ""} onChange={(e) => setFeedbacks({ ...feedbacks, [t.id]: e.target.value })} rows={3} maxLength={1000} placeholder="Feedback obrigatório: o que foi feito e qual o resultado?" className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" />
                        <button onClick={() => void agir(t.id, "concluir")} className="rounded-lg bg-emerald-600 px-4 py-2 text-[14px] font-semibold text-white">Concluir com feedback</button>
                      </>
                    ) : (
                      <button onClick={() => setAbertaId(t.id)} className="rounded-lg bg-emerald-600 px-4 py-2 text-[14px] font-semibold text-white">Concluir</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>

          <section className="space-y-2">
            <h2 className="text-[14px] font-semibold text-zinc-700">Concluídas ({feitas.length})</h2>
            {feitas.map((t) => (
              <div key={t.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[14px] font-medium text-zinc-700">✅ {t.titulo}</p>
                <p className="text-[12px] text-zinc-500">{ehAdmin ? `${t.paraNome} · ` : ""}concluída {quando(t.concluidaAt as string)} (prazo {quando(t.prazoEm)})</p>
                {t.feedback && <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white px-2 py-1.5 text-[13px] text-zinc-600">{t.feedback}</p>}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

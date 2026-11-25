"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Tarefa nova: aparece na tela assim que chega ───────────────────────────
// Mostra o prazo de resolução com clareza. A pessoa ACEITA o prazo ou diz que
// não consegue e propõe outro (horas ou dias depois) com justificativa; o
// administrador decide. "Responder depois" esconde por 10 min (não trava a tela).

interface Item { id: string; titulo: string; detalhes: string | null; prazoEm: string; deNome: string }

const CHECAR_A_CADA_MS = 15_000 // aba escondida não pergunta (menos carga no servidor)
const ADIAR_MS = 10 * 60_000

const dataHora = (d: Date) => d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
function falta(ms: number): string {
  if (ms <= 0) return "já passou"
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`
  const d = Math.floor(h / 24)
  return `${d} dia${d > 1 ? "s" : ""}${h % 24 ? ` e ${h % 24} h` : ""}`
}
function paraCampo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function TarefaAlerta() {
  const [itens, setItens] = useState<Item[]>([])
  const [adiadas, setAdiadas] = useState<Record<string, number>>({})
  const [agora, setAgora] = useState(() => Date.now())

  const carregar = useCallback(async () => {
    if (document.hidden) return
    try {
      const r = await fetch("/api/tarefas?aresponder=1", { cache: "no-store" })
      if (!r.ok) return
      setItens(((await r.json()) as { tarefas: Item[] }).tarefas)
    } catch { /* sem conexão: tenta no próximo ciclo */ }
  }, [])

  useEffect(() => {
    void (async () => { await carregar() })()
    const t = setInterval(() => { void carregar(); setAgora(Date.now()) }, CHECAR_A_CADA_MS)
    const aoVoltar = () => { if (document.visibilityState === "visible") void carregar() }
    document.addEventListener("visibilitychange", aoVoltar)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar) }
  }, [carregar])

  const atual = itens.find((i) => (adiadas[i.id] ?? 0) < agora)
  if (!atual) return null
  return (
    <Cartao key={atual.id} atual={atual} agora={agora}
      aoResponder={() => setItens((antes) => antes.filter((i) => i.id !== atual.id))}
      aoAdiar={() => setAdiadas((a) => ({ ...a, [atual.id]: Date.now() + ADIAR_MS }))} />
  )
}

// Um cartão por tarefa (a chave troca o estado do formulário a cada tarefa nova).
function Cartao({ atual, agora, aoResponder, aoAdiar }: { atual: Item; agora: number; aoResponder: () => void; aoAdiar: () => void }) {
  const [propondo, setPropondo] = useState(false)
  const [novoPrazo, setNovoPrazo] = useState("")
  const [justificativa, setJustificativa] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")

  const prazo = new Date(atual.prazoEm)
  const sugerir = (horas: number) => setNovoPrazo(paraCampo(new Date(Math.max(prazo.getTime(), agora) + horas * 3_600_000)))

  async function enviar(corpo: Record<string, unknown>, okMsg: string) {
    if (enviando) return
    setEnviando(true); setErro("")
    try {
      const r = await fetch(`/api/tarefas/${atual.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível registrar. Tente de novo."); return }
      aoResponder()
      window.alert(okMsg)
    } catch { setErro("Sem conexão. Tente de novo.") }
    finally { setEnviando(false) }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Nova tarefa" className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-700">📝 Nova tarefa de {atual.deNome}</p>
        <h2 className="mt-1 text-lg font-bold text-zinc-800">{atual.titulo}</h2>
        {atual.detalhes && <p className="mt-2 whitespace-pre-wrap text-[14px] text-zinc-600">{atual.detalhes}</p>}

        <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <p className="text-[12px] font-semibold text-amber-800">⏰ PRAZO PARA RESOLVER</p>
          <p className="text-[18px] font-bold text-amber-900">{dataHora(prazo)}</p>
          <p className="text-[13px] text-amber-800">daqui a {falta(prazo.getTime() - agora)}</p>
        </div>

        {!propondo ? (
          <div className="mt-4 space-y-2">
            <button disabled={enviando} onClick={() => void enviar({ acao: "ciente" }, "Prazo aceito. Quando terminar, conclua a tarefa com o feedback em Tarefas.")} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-60">
              ✅ Aceito o prazo
            </button>
            <button disabled={enviando} onClick={() => { setPropondo(true); sugerir(2) }} className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-[14px] font-medium text-zinc-700">
              Não consigo nesse prazo — propor outro
            </button>
            <button onClick={() => aoAdiar()} className="w-full text-[12px] text-zinc-400 hover:text-zinc-600">Responder depois (volto a perguntar em 10 min)</button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1 text-[13px] font-medium text-zinc-700">Qual prazo você consegue?</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {[{ l: "+2 horas", h: 2 }, { l: "+4 horas", h: 4 }, { l: "+1 dia", h: 24 }, { l: "+2 dias", h: 48 }].map((o) => (
                  <button key={o.l} type="button" onClick={() => sugerir(o.h)} className="rounded-full border border-zinc-300 px-3 py-1 text-[12px] text-zinc-700 hover:bg-zinc-50">{o.l}</button>
                ))}
              </div>
              <input type="datetime-local" value={novoPrazo} min={paraCampo(prazo)} onChange={(e) => setNovoPrazo(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" aria-label="Novo prazo" />
            </div>
            <div>
              <p className="mb-1 text-[13px] font-medium text-zinc-700">Por que precisa de mais tempo? <span className="font-normal text-zinc-400">(obrigatório)</span></p>
              <textarea value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={3} maxLength={300} placeholder="Ex.: preciso aguardar o retorno do fornecedor." className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px]" />
            </div>
            <div className="flex gap-2">
              <button disabled={enviando} onClick={() => setPropondo(false)} className="rounded-xl border border-zinc-300 px-4 py-2.5 text-[14px] text-zinc-700">Voltar</button>
              <button disabled={enviando} onClick={() => void enviar({ acao: "propor", prazoProposto: novoPrazo ? new Date(novoPrazo).toISOString() : "", justificativa }, "Pedido enviado ao administrador. Você será avisado da decisão.")} className="flex-1 rounded-xl bg-zinc-800 px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60">
                {enviando ? "Enviando…" : "Enviar pedido de novo prazo"}
              </button>
            </div>
          </div>
        )}
        {erro && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{erro}</p>}
      </div>
    </div>
  )
}

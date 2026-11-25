"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Aviso do administrador: janela grande com ciência ──────────────────────
// Aparece na tela assim que o aviso chega. A pessoa lê e clica em "Ciente"; o
// servidor grava quem e quando. Se o aviso é uma PERGUNTA, ela precisa escrever
// a resposta para dar o ciente; nos demais, pode comentar se quiser.
// "Ver depois" esconde por 10 min (não trava o atendimento).

interface Item { id: string; titulo: string; texto: string; imagemUrl: string | null; exigeResposta: boolean; deNome: string; criadoEm: string }

const CHECAR_A_CADA_MS = 15_000
const ADIAR_MS = 10 * 60_000

export default function AvisoAlerta() {
  const [itens, setItens] = useState<Item[]>([])
  const [adiados, setAdiados] = useState<Record<string, number>>({})
  const [agora, setAgora] = useState(() => Date.now())

  const carregar = useCallback(async () => {
    if (document.hidden) return
    try {
      const r = await fetch("/api/avisos?pendentes=1", { cache: "no-store" })
      if (!r.ok) return
      setItens(((await r.json()) as { avisos: Item[] }).avisos)
    } catch { /* sem conexão: tenta no próximo ciclo */ }
  }, [])

  useEffect(() => {
    void (async () => { await carregar() })()
    const t = setInterval(() => { void carregar(); setAgora(Date.now()) }, CHECAR_A_CADA_MS)
    const aoVoltar = () => { if (document.visibilityState === "visible") void carregar() }
    document.addEventListener("visibilitychange", aoVoltar)
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", aoVoltar) }
  }, [carregar])

  const visiveis = itens.filter((i) => (adiados[i.id] ?? 0) < agora)
  const atual = visiveis[0]
  if (!atual) return null
  return (
    <Cartao key={atual.id} atual={atual} restantes={visiveis.length}
      aoResponder={() => setItens((antes) => antes.filter((i) => i.id !== atual.id))}
      aoAdiar={() => setAdiados((a) => ({ ...a, [atual.id]: Date.now() + ADIAR_MS }))} />
  )
}

// Um cartão por aviso (a chave zera o campo de resposta a cada aviso novo).
function Cartao({ atual, restantes, aoResponder, aoAdiar }: { atual: Item; restantes: number; aoResponder: () => void; aoAdiar: () => void }) {
  const [resposta, setResposta] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")
  const faltaResposta = atual.exigeResposta && resposta.trim().length < 2

  async function ciente() {
    if (enviando || faltaResposta) return
    setEnviando(true); setErro("")
    try {
      const r = await fetch(`/api/avisos/${atual.id}/ciente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resposta }) })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível registrar. Confira a internet e tente de novo."); return }
      aoResponder()
    } catch { setErro("Sem conexão. Tente de novo.") }
    finally { setEnviando(false) }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Aviso" className="fixed inset-0 z-[121] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-sky-700">{atual.exigeResposta ? "❓ Pergunta" : "📢 Aviso"} de {atual.deNome}{restantes > 1 ? ` · ${restantes} avisos para ler` : ""}</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-900">{atual.titulo}</h2>
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-700">{atual.texto}</p>
        {atual.imagemUrl && (
          <a href={atual.imagemUrl} target="_blank" rel="noreferrer" className="mt-3 block overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50" title="Abrir a imagem em tamanho grande">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem privada do aviso, sem ganho com next/image */}
            <img src={atual.imagemUrl} alt="Imagem do aviso" className="max-h-[42vh] w-full object-contain" />
          </a>
        )}
        <label className="mt-4 block text-[13px] font-semibold text-zinc-700">
          {atual.exigeResposta ? "Sua resposta (obrigatória)" : "Quer comentar? (opcional)"}
          <textarea value={resposta} onChange={(e) => setResposta(e.target.value)} rows={atual.exigeResposta ? 3 : 2} maxLength={500}
            placeholder={atual.exigeResposta ? "Escreva a sua resposta aqui" : "Só se precisar dizer algo sobre o aviso"}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-[14px] font-normal text-zinc-800 outline-none focus:border-sky-500" />
        </label>
        <button disabled={enviando || faltaResposta} onClick={() => void ciente()} className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-50">
          {enviando ? "Registrando…" : atual.exigeResposta ? "✅ Responder e dar ciente" : "✅ Ciente — li e entendi"}
        </button>
        {faltaResposta && <p className="mt-1.5 text-center text-[12px] text-amber-700">Escreva a resposta para poder dar o ciente.</p>}
        <button onClick={aoAdiar} className="mt-2 w-full text-[12px] text-zinc-400 hover:text-zinc-600">Ver depois (volto a avisar em 10 min)</button>
        {erro && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{erro}</p>}
      </div>
    </div>
  )
}

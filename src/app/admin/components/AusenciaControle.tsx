"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Botão "Ausente" ─────────────────────────────────────────────────────────
// A pessoa avisa que saiu por alguns minutos (banheiro, saiu da posição, resolver
// algo). Enquanto durar, o gerente virtual não cobra, ela sai do rodízio e o
// assistente virtual avisa os clientes dela. Volta sozinho no fim do prazo.

interface Estado {
  ausente: boolean
  motivo?: string
  ate?: number
  motivos: { id: string; rotulo: string; minutos: number }[]
}

const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

export default function AusenciaControle() {
  const [st, setSt] = useState<Estado | null>(null)
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState("")
  const [agora, setAgora] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/presenca/ausente", { cache: "no-store" })
      if (r.ok) { setSt((await r.json()) as Estado); setAgora(Date.now()) }
    } catch { /* tenta no próximo ciclo */ }
  }, [])

  useEffect(() => {
    void (async () => { await carregar() })()
    const t = setInterval(() => void carregar(), 30_000)
    return () => clearInterval(t)
  }, [carregar])

  const sair = async (motivo: string) => {
    setOcupado(true); setErro("")
    try {
      const r = await fetch("/api/presenca/ausente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo }) })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível registrar."); return }
      setAberto(false); await carregar()
    } catch { setErro("Sem conexão. Tente de novo.") } finally { setOcupado(false) }
  }

  const voltei = async () => {
    setOcupado(true)
    try { await fetch("/api/presenca/ausente", { method: "DELETE" }); await carregar() } finally { setOcupado(false) }
  }

  if (!st) return null
  const rotulo = st.motivos.find((m) => m.id === st.motivo)?.rotulo ?? "Ausente"

  if (st.ausente && st.ate) {
    const restam = Math.max(0, Math.ceil((st.ate - agora) / 60_000))
    return (
      <div role="status" className="fixed left-1/2 top-3 z-[75] flex -translate-x-1/2 items-center gap-3 rounded-full border border-amber-300 bg-amber-50 py-1.5 pl-4 pr-1.5 text-[12.5px] font-semibold text-amber-900 shadow-lg">
        <span>{rotulo} · volta às {hora(st.ate)}{restam > 0 ? ` (${restam} min)` : ""}</span>
        <button type="button" onClick={() => void voltei()} disabled={ocupado} className="rounded-full bg-amber-600 px-3 py-1 text-white hover:bg-amber-700 disabled:opacity-50">Voltei</button>
      </div>
    )
  }

  return (
    <div className="fixed right-4 top-3 z-[75]">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-zinc-700 shadow hover:bg-zinc-50">
        🚪 Ausente
      </button>
      {aberto && (
        <div className="mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl">
          <p className="px-2 pb-1 pt-1 text-[11.5px] leading-snug text-zinc-500">Você sai por alguns minutos: o gerente não cobra e o assistente virtual avisa seus clientes que você já volta.</p>
          {st.motivos.map((m) => (
            <button key={m.id} type="button" disabled={ocupado} onClick={() => void sair(m.id)} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
              <span>{m.rotulo}</span><span className="text-[11px] text-zinc-400">{m.minutos} min</span>
            </button>
          ))}
          {erro && <p role="alert" className="px-2 pb-1 text-[12px] text-red-600">⚠️ {erro}</p>}
        </div>
      )}
    </div>
  )
}

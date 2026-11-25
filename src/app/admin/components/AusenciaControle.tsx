"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Botão "Ausente" ─────────────────────────────────────────────────────────
// A pessoa avisa que saiu por alguns minutos. Pode escrever um motivo (opcional,
// texto livre — não precisa informar nada de saúde). Enquanto durar, o gerente
// virtual não cobra, ela sai do rodízio e o assistente virtual avisa os clientes
// dela. O tempo até voltar fica registrado. Prazo máximo: 30 min.

interface Estado { ausente: boolean; desde: number | null; ate: number | null; prazoMin: number }

const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

export default function AusenciaControle() {
  const [st, setSt] = useState<Estado | null>(null)
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
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

  const sair = async () => {
    setOcupado(true); setErro("")
    try {
      const r = await fetch("/api/presenca/ausente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo: motivo.trim() }) })
      const d = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) { setErro(d.erro ?? "Não foi possível registrar."); return }
      setAberto(false); setMotivo(""); await carregar()
    } catch { setErro("Sem conexão. Tente de novo.") } finally { setOcupado(false) }
  }

  const voltei = async () => {
    setOcupado(true)
    try { await fetch("/api/presenca/ausente", { method: "DELETE" }); await carregar() } finally { setOcupado(false) }
  }

  if (!st) return null

  // Fica no menu lateral (rodapé), para nunca cobrir os botões da conversa.
  if (st.ausente && st.desde && st.ate) {
    const fora = Math.max(0, Math.round((agora - st.desde) / 60_000))
    return (
      <div role="status" className="mb-1 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-[12px] font-semibold text-amber-900">
        <p>🚪 Ausente desde {hora(st.desde)} · {fora} min</p>
        <button type="button" onClick={() => void voltei()} disabled={ocupado} className="mt-1.5 w-full rounded-lg bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50">Voltei</button>
      </div>
    )
  }

  return (
    <div className="mb-1">
      {aberto && (
        <form className="mb-2 space-y-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm" onSubmit={(e) => { e.preventDefault(); void sair() }}>
          <p className="text-[11.5px] leading-snug text-zinc-500">Você sai por alguns minutos: o gerente não cobra e o assistente virtual avisa seus clientes que você já volta. O tempo até voltar fica registrado (máx. {st.prazoMin} min).</p>
          <label className="block text-[12px] font-semibold text-zinc-700">
            Motivo <span className="font-normal text-zinc-400">(opcional)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 80))} placeholder="Escreva se quiser" className="mt-1 w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[12.5px] font-normal text-zinc-800 outline-none focus:border-[#0b3f8a]" />
          </label>
          <p className="text-[10.5px] text-zinc-400">Não precisa informar dados de saúde. Só o administrador vê o que for escrito.</p>
          {erro && <p role="alert" className="text-[12px] text-red-600">⚠️ {erro}</p>}
          <button type="submit" disabled={ocupado} className="w-full rounded-xl bg-[#002d6b] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[#0b3f8a] disabled:opacity-50">{ocupado ? "Registrando…" : "Ficar ausente"}</button>
        </form>
      )}
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-800">
        <span aria-hidden className="flex h-4 w-4 items-center justify-center text-[13px] leading-none">🚪</span>
        Ausente
      </button>
    </div>
  )
}

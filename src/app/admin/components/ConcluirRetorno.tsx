"use client"

import { useEffect, useState } from "react"

// ─── Concluir retorno: como foi + relato (obrigatórios) ──────────────────────
// Qualquer tela que "conclui" um retorno dispara EVENTO_CONCLUIR; esta caixa
// (montada uma vez no AdminShell) pergunta o canal e o que foi conversado.
// O administrador confere depois e fecha como Concluído ou Não concluído.

export const EVENTO_CONCLUIR = "retorno:concluir"
export const EVENTO_CONCLUIDO = "retorno:concluido"

export function pedirConclusaoRetorno(id: string, cliente: string): void {
  window.dispatchEvent(new CustomEvent(EVENTO_CONCLUIR, { detail: { id, cliente } }))
}

const CANAIS = [
  { id: "WHATSAPP", rotulo: "WhatsApp", dica: "pelo celular / WhatsApp fora do sistema" },
  { id: "FRTWHATS", rotulo: "frtwhats", dica: "pelo chat do sistema" },
  { id: "TELEFONE", rotulo: "Telefone", dica: "liguei para o cliente" },
  { id: "EMAIL", rotulo: "E-mail", dica: "enviei e-mail" },
] as const

const MIN_RELATO = 10

export default function ConcluirRetorno() {
  const [alvo, setAlvo] = useState<{ id: string; cliente: string } | null>(null)
  const [canal, setCanal] = useState("")
  const [relato, setRelato] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")

  useEffect(() => {
    const abrir = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; cliente: string }>).detail
      if (!d?.id) return
      setAlvo(d); setCanal(""); setRelato(""); setErro("")
    }
    window.addEventListener(EVENTO_CONCLUIR, abrir)
    return () => window.removeEventListener(EVENTO_CONCLUIR, abrir)
  }, [])

  if (!alvo) return null
  const pronto = canal !== "" && relato.trim().length >= MIN_RELATO

  const salvar = async () => {
    if (!pronto || salvando) return
    setSalvando(true); setErro("")
    try {
      const res = await fetch(`/api/reminders/${alvo.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true, canal, relato: relato.trim() }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) { setErro(d.error ?? "Não foi possível registrar. Tente de novo."); return }
      window.dispatchEvent(new CustomEvent(EVENTO_CONCLUIDO, { detail: { id: alvo.id } }))
      setAlvo(null)
    } catch {
      setErro("Sem conexão. Confira a internet e tente de novo.")
    } finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="concluir-titulo">
      <div className="w-full max-w-md overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 id="concluir-titulo" className="text-[16px] font-semibold text-zinc-900">Como foi o retorno com {alvo.cliente}?</h2>
          <p className="mt-1 text-[12px] text-zinc-500">Conte para a gerência conferir. Depois da conferência o retorno fica como concluído.</p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <fieldset>
            <legend className="text-[12.5px] font-semibold text-zinc-800">Por onde você falou com o cliente? *</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {CANAIS.map((c) => (
                <label key={c.id} className={`cursor-pointer rounded-xl border px-3 py-2 text-[12.5px] ${canal === c.id ? "border-[#002d6b] bg-[#002d6b]/5 font-semibold text-[#002d6b]" : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"}`}>
                  <input type="radio" name="canal-retorno" value={c.id} checked={canal === c.id} onChange={() => setCanal(c.id)} className="sr-only" />
                  <span className="block">{c.rotulo}</span>
                  <span className="block text-[10.5px] font-normal text-zinc-500">{c.dica}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-[12.5px] font-semibold text-zinc-800">O que foi conversado / combinado? *</span>
            <textarea
              value={relato} onChange={(e) => setRelato(e.target.value.slice(0, 500))} rows={4}
              placeholder="Ex.: Falei com o Sr. João, ele vai aprovar o orçamento até sexta."
              className="mt-1.5 w-full rounded-xl border border-zinc-300 px-3 py-2 text-[13px] text-zinc-800 outline-none focus:border-[#0b3f8a]"
            />
            <span className="text-[11px] text-zinc-500">{relato.trim().length < MIN_RELATO ? `Escreva pelo menos ${MIN_RELATO} letras.` : `${relato.length}/500`}</span>
          </label>
          {erro && <p role="alert" className="text-[12px] font-medium text-red-600">⚠️ {erro}</p>}
        </div>
        <div className="flex gap-2 border-t border-zinc-100 px-5 py-3">
          <button type="button" onClick={() => setAlvo(null)} className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50">Cancelar</button>
          <button type="button" onClick={() => void salvar()} disabled={!pronto || salvando} className="flex-1 rounded-xl bg-[#002d6b] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[#0b3f8a] disabled:cursor-not-allowed disabled:opacity-40">
            {salvando ? "Registrando…" : "Registrar retorno"}
          </button>
        </div>
      </div>
    </div>
  )
}

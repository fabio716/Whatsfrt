"use client"

import { useCallback, useEffect, useState } from "react"
import { quandoTexto, venceAteHoje } from "../chats/components/Lembretes"
import Mascote from "@/components/ui/Mascote"

// ─── Meus retornos (vendedoras) ─────────────────────────────────────────────
// O mascote fica na tela lembrando dos retornos que vencem hoje ou já venceram,
// em qualquer página. Depois do "Estou ciente" da tela de aviso, o lembrete
// continua aqui até a vendedora marcar "Fiz o retorno" (ligou ou respondeu).

interface Item {
  id: string
  dueAt: string
  note: string
  contact: { id: string; name: string; empresa: string | null }
}

export default function MeusRetornos() {
  const [itens, setItens] = useState<Item[]>([])
  const [agora, setAgora] = useState(0)
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState("")

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders", { cache: "no-store" })
      if (!res.ok) return
      const todos = (await res.json()) as Item[]
      const t = Date.now()
      setAgora(t)
      setItens(todos.filter((l) => venceAteHoje(l.dueAt, t)))
    } catch {
      // sem conexão: tenta no próximo ciclo
    }
  }, [])

  useEffect(() => {
    void (async () => { await carregar() })()
    const timer = setInterval(() => void carregar(), 60_000)
    const aoVoltar = () => { if (document.visibilityState === "visible") void carregar() }
    document.addEventListener("visibilitychange", aoVoltar)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", aoVoltar)
    }
  }, [carregar])

  const fiz = async (id: string) => {
    if (ocupado) return
    setOcupado(id)
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      })
      if (res.ok) setItens((antes) => antes.filter((i) => i.id !== id))
    } catch {
      // mantém na lista
    } finally {
      setOcupado("")
    }
  }

  if (itens.length === 0) return null
  const atrasados = itens.filter((i) => Date.parse(i.dueAt) < agora - 5 * 60_000).length

  return (
    <aside className="fixed bottom-24 right-4 z-[70] w-[min(21rem,calc(100vw-2rem))]" aria-label="Meus retornos">
      {aberto && (
        <div className="mb-2 flex max-h-[55vh] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
          <p className="border-b border-zinc-100 px-4 py-2.5 text-[12.5px] font-semibold text-zinc-900">
            Retornos para fazer hoje
          </p>
          <ul className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {itens.map((i) => {
              const atrasado = Date.parse(i.dueAt) < agora - 5 * 60_000
              return (
                <li key={i.id} className="rounded-xl bg-zinc-50 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <a href={`/admin/chats?contact=${i.contact.id}`} className="text-[12.5px] font-semibold text-zinc-900 hover:underline">{i.contact.name}</a>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${atrasado ? "bg-red-100 text-red-700" : "bg-[#00bf5b]/15 text-[#00793a]"}`}>
                      {atrasado ? "ATRASADO · " : ""}{quandoTexto(i.dueAt, agora || Date.parse(i.dueAt))}
                    </span>
                  </div>
                  {i.note && <p className="mt-0.5 text-[11.5px] leading-snug text-zinc-600">{i.note}</p>}
                  <button
                    type="button"
                    onClick={() => void fiz(i.id)}
                    disabled={ocupado !== ""}
                    className="mt-1.5 rounded-lg bg-[#002d6b] px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-[#0b3f8a] disabled:opacity-50"
                  >
                    {ocupado === i.id ? "Salvando…" : "Fiz o retorno"}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={`ml-auto flex items-center gap-2.5 rounded-full border bg-white py-1.5 pl-1.5 pr-4 shadow-lg ${atrasados > 0 ? "border-red-300" : "border-zinc-200"}`}
      >
        <Mascote className="h-10 w-10 rounded-full" humor={atrasados > 0 ? "surpreso" : "normal"} />
        <span className={`text-[12.5px] font-semibold ${atrasados > 0 ? "text-red-700" : "text-zinc-800"}`}>
          {itens.length === 1 ? "1 retorno para fazer" : `${itens.length} retornos para fazer`}
          {atrasados > 0 ? ` · ${atrasados} atrasado${atrasados === 1 ? "" : "s"}` : ""}
        </span>
      </button>
    </aside>
  )
}

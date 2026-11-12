"use client"

import { useCallback, useEffect, useState } from "react"
import { quandoTexto } from "../chats/components/Lembretes"

// ─── Resumo do atendente virtual (só administrador) ──────────────────────────
// O mascote conta o que fez enquanto a equipe estava fora: quem atendeu, com
// quem ficou e quando é o retorno. Não trava nada: o administrador lê e marca
// "Ciente" para tirar o aviso da tela. Reaparece quando houver atendimento novo.

interface Item {
  contactId: string
  cliente: string
  respostas: number
  perguntou: string
  vendedora: string | null
  retornoEm: string | null
  atrasado: boolean
}
interface Resumo { total: number; respostas: number; itens: Item[] }

export default function ResumoAtendenteVirtual() {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [agora, setAgora] = useState(0)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/atendente-virtual/resumo", { cache: "no-store" })
      if (!res.ok) return
      setResumo((await res.json()) as Resumo)
      setAgora(Date.now())
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

  const ciente = async () => {
    if (enviando) return
    setEnviando(true)
    try {
      const res = await fetch("/api/admin/atendente-virtual/resumo", { method: "POST" })
      if (res.ok) setResumo({ total: 0, respostas: 0, itens: [] })
    } catch {
      // mantém o cartão; ela tenta de novo
    } finally {
      setEnviando(false)
    }
  }

  if (!resumo || resumo.total === 0) return null

  return (
    <aside className="fixed bottom-4 right-4 z-[80] flex max-h-[70vh] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl" aria-label="Resumo do atendente virtual">
      <div className="flex items-start gap-3 border-b border-zinc-100 px-4 py-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- figura estática pequena */}
        <img src="/mascote-frt.png" alt="Atendente virtual da FRT" className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold leading-snug text-zinc-900">
            {resumo.total === 1 ? "Atendi 1 cliente" : `Atendi ${resumo.total} clientes`} enquanto a equipe estava fora
          </p>
          <p className="text-[11.5px] text-zinc-500">{resumo.respostas} {resumo.respostas === 1 ? "resposta enviada" : "respostas enviadas"}</p>
        </div>
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {resumo.itens.map((i) => (
          <li key={i.contactId} className="rounded-xl bg-zinc-50 px-3 py-2">
            <a href={`/admin/chats?contact=${i.contactId}`} className="text-[12.5px] font-semibold text-zinc-900 underline-offset-2 hover:underline">{i.cliente}</a>
            {i.perguntou && <p className="mt-0.5 truncate text-[11.5px] text-zinc-500">“{i.perguntou}”</p>}
            <p className="mt-0.5 text-[11.5px] text-zinc-700">
              {i.vendedora ? `Com ${i.vendedora}` : "Na fila, sem vendedora"}
              {i.retornoEm ? ` · retorno ${quandoTexto(i.retornoEm, agora || Date.parse(i.retornoEm))}` : ""}
              {i.atrasado ? <span className="ml-1 font-bold text-red-600">· ATRASADO</span> : null}
            </p>
          </li>
        ))}
        {resumo.total > resumo.itens.length && (
          <li className="px-1 text-[11.5px] text-zinc-400">e mais {resumo.total - resumo.itens.length}…</li>
        )}
      </ul>

      <div className="border-t border-zinc-100 px-4 py-3">
        <button
          type="button"
          onClick={() => void ciente()}
          disabled={enviando}
          className="w-full rounded-xl bg-[#002d6b] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0b3f8a] disabled:opacity-50"
        >
          {enviando ? "Registrando…" : "Ciente"}
        </button>
      </div>
    </aside>
  )
}

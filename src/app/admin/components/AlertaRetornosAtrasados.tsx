"use client"

import { useEffect, useState } from "react"

// Faixa vermelha para o administrador: retornos do atendente virtual que
// passaram do horário sem a vendedora concluir. Some sozinha quando concluem.

interface Atraso {
  id: string
  dueAt: string
  vendedora: string
  contactId: string
  cliente: string
  // Preenchidos quando uma pessoa já respondeu o cliente.
  atendidoEm: string | null
  atendidoPor: string | null
}

export default function AlertaRetornosAtrasados() {
  const [lista, setLista] = useState<Atraso[]>([])

  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    const carregar = async () => {
      try {
        const res = await fetch("/api/admin/retornos-atrasados", { cache: "no-store" })
        if (res.ok) setLista((await res.json()) as Atraso[])
      } catch {
        // sem conexão: tenta no próximo ciclo
      }
    }
    void carregar()
    const timer = setInterval(() => void carregar(), 60_000)
    return () => clearInterval(timer)
  }, [])

  // "Ciente": tira a faixa da tela deste administrador (atraso novo a traz de volta).
  const ciente = async () => {
    if (enviando) return
    setEnviando(true)
    try {
      const res = await fetch("/api/admin/retornos-atrasados", { method: "POST" })
      if (res.ok) setLista([])
    } catch {
      // mantém a faixa; tenta de novo no próximo clique
    } finally {
      setEnviando(false)
    }
  }

  if (lista.length === 0) return null
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
  const esperando = lista.filter((a) => !a.atendidoEm).length
  const tudoAtendido = esperando === 0

  return (
    <div role="alert" className={`fixed inset-x-0 top-0 z-[90] flex items-center gap-3 border-b px-4 py-2 shadow-sm md:left-[var(--nav-w,0px)] ${tudoAtendido ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- figura estática pequena */}
      <img src="/mascote-frt.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className={`text-[12.5px] font-semibold ${tudoAtendido ? "text-emerald-800" : "text-red-700"}`}>
          {tudoAtendido
            ? `✅ ${lista.length === 1 ? "1 retorno atrasado, já atendido" : `${lista.length} retornos atrasados, todos já atendidos`}`
            : `⚠️ ${esperando === 1 ? "1 cliente esperando retorno" : `${esperando} clientes esperando retorno`}${lista.length > esperando ? ` · ${lista.length - esperando} já atendido${lista.length - esperando === 1 ? "" : "s"}` : ""}`}
        </p>
        <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-zinc-800">
          {lista.slice(0, 6).map((a) => (
            <li key={a.id}>
              <a href={`/admin/chats?contact=${a.contactId}`} className="underline underline-offset-2 hover:text-zinc-950">
                {a.cliente}
              </a>{" "}
              · {a.vendedora} · combinado {hora(a.dueAt)} ·{" "}
              {a.atendidoEm
                ? <span className="font-semibold text-emerald-700">✅ atendido {a.atendidoPor ? `por ${a.atendidoPor} ` : ""}às {hora(a.atendidoEm)}</span>
                : <span className="font-semibold text-red-700">⏳ sem resposta</span>}
            </li>
          ))}
          {lista.length > 6 && <li>e mais {lista.length - 6}…</li>}
        </ul>
      </div>
      <button
        type="button"
        onClick={() => void ciente()}
        disabled={enviando}
        className={`ml-auto shrink-0 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50 ${tudoAtendido ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"}`}
      >
        {enviando ? "…" : "Ciente"}
      </button>
    </div>
  )
}

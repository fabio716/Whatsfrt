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
}

export default function AlertaRetornosAtrasados() {
  const [lista, setLista] = useState<Atraso[]>([])

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

  if (lista.length === 0) return null
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[90] flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 shadow-sm md:left-[var(--nav-w,0px)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- figura estática pequena */}
      <img src="/mascote-frt.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0">
      <p className="text-[12.5px] font-semibold text-red-700">
        ⚠️ {lista.length === 1 ? "1 retorno atrasado" : `${lista.length} retornos atrasados`} — o cliente está esperando
      </p>
      <ul className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-red-800">
        {lista.slice(0, 5).map((a) => (
          <li key={a.id}>
            <a href={`/admin/chats?contact=${a.contactId}`} className="underline underline-offset-2 hover:text-red-950">
              {a.cliente}
            </a>{" "}
            · {a.vendedora} · combinado {hora(a.dueAt)}
          </li>
        ))}
        {lista.length > 5 && <li>e mais {lista.length - 5}…</li>}
      </ul>
      </div>
    </div>
  )
}

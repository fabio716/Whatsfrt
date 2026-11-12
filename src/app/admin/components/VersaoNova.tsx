"use client"

import { useEffect, useState } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// Aviso de versão nova. Depois de um deploy, quem estava com o sistema aberto
// continua rodando o código antigo até apertar F5 — sem ver novidades nem
// correções. Aqui a aba pergunta ao servidor, de tempos em tempos, qual build
// está no ar e compara com o dela.
//
// - Aba em segundo plano (ninguém olhando): recarrega sozinha.
// - Aba na frente: avisa e recarrega SOZINHA em 20 segundos (contagem na barra;
//   "Atualizar agora" adianta). Se a pessoa estiver com texto digitado num
//   campo, espera até 60 segundos a mais pra ela enviar — depois recarrega
//   de qualquer jeito, pra ninguém ficar com versão antiga.
// ═══════════════════════════════════════════════════════════════════════════

const MINHA_VERSAO = process.env.NEXT_PUBLIC_VERSAO_BUILD ?? ""
const INTERVALO_MS = 2 * 60_000
const CONTAGEM_S = 20
const PRORROGACAO_S = 60

// Tem texto digitado num campo que está com o foco? (mensagem sendo escrita)
function digitandoAgora(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
  return el.value.trim().length > 0
}

export default function VersaoNova() {
  const [desatualizada, setDesatualizada] = useState(false)
  const [restam, setRestam] = useState(CONTAGEM_S)

  useEffect(() => {
    if (!MINHA_VERSAO) return
    let antiga = false

    const conferir = async () => {
      try {
        const res = await fetch("/api/versao", { cache: "no-store" })
        if (!res.ok) return
        const { versao } = (await res.json()) as { versao?: string }
        // Durante o deploy o servidor pode estar fora — sem resposta, não decide nada.
        if (versao && versao !== MINHA_VERSAO) {
          antiga = true
          if (document.hidden) globalThis.location.reload()
          else setDesatualizada(true)
        }
      } catch { /* servidor reiniciando — tenta na próxima */ }
    }

    const aoTrocarVisibilidade = () => {
      if (document.hidden && antiga) globalThis.location.reload()
      else if (!document.hidden) void conferir()
    }

    void conferir()
    const t = setInterval(() => void conferir(), INTERVALO_MS)
    document.addEventListener("visibilitychange", aoTrocarVisibilidade)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade)
    }
  }, [])

  // Versão antiga na frente: conta e recarrega sozinha.
  useEffect(() => {
    if (!desatualizada) return
    let segundos = CONTAGEM_S
    let extra = 0
    const t = setInterval(() => {
      if (segundos > 0) {
        segundos -= 1
        setRestam(segundos)
        return
      }
      // Acabou a contagem: só espera mais se estiver digitando, e só por um tempo.
      if (digitandoAgora() && extra < PRORROGACAO_S) {
        extra += 1
        return
      }
      globalThis.location.reload()
    }, 1000)
    return () => clearInterval(t)
  }, [desatualizada])

  if (!desatualizada) return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-[12.5px] text-sky-900">
      <span>✨ Saiu uma versão nova do WhatsFRT. {restam > 0 ? `Atualizando sozinho em ${restam}s…` : "Atualizando…"}</span>
      <button
        type="button"
        onClick={() => globalThis.location.reload()}
        className="flex-shrink-0 rounded-lg bg-sky-700 px-3 py-1 text-[12px] font-semibold text-white hover:bg-sky-800"
      >
        Atualizar agora
      </button>
    </div>
  )
}

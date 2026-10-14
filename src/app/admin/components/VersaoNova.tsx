"use client"

import { useEffect, useState } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// Aviso de versão nova. Depois de um deploy, quem estava com o sistema aberto
// continua rodando o código antigo até apertar F5 — sem ver novidades nem
// correções. Aqui a aba pergunta ao servidor, de tempos em tempos, qual build
// está no ar e compara com o dela.
//
// - Aba em segundo plano (ninguém olhando): recarrega sozinha.
// - Aba na frente: mostra uma barra "Atualizar agora". Não recarrega à força
//   porque a pessoa pode estar no meio de uma mensagem.
// ═══════════════════════════════════════════════════════════════════════════

const MINHA_VERSAO = process.env.NEXT_PUBLIC_VERSAO_BUILD ?? ""
const INTERVALO_MS = 2 * 60_000

export default function VersaoNova() {
  const [desatualizada, setDesatualizada] = useState(false)

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

  if (!desatualizada) return null
  return (
    <div className="flex items-center justify-between gap-3 border-b border-sky-200 bg-sky-50 px-4 py-2 text-[12.5px] text-sky-900">
      <span>✨ Saiu uma versão nova do WhatsFRT, com novidades.</span>
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

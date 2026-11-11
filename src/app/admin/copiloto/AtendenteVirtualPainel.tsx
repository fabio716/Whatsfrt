"use client"

import { useCallback, useEffect, useState } from "react"

// ─── Atendente virtual — painel de controle (admin) ──────────────────────────
// Liga/desliga a IA que responde o cliente à noite, no fim de semana e no
// almoço. Fica na tela Copiloto porque usa a mesma base de conhecimento.

interface Estado {
  ativoNoite: boolean
  ativoAlmoco: boolean
  numerosTeste: string
  configured: boolean
  baseVazia: boolean
  precosAtualizadosEm: string | null
  precosQtd: number
}

export default function AtendenteVirtualPainel() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [numeros, setNumeros] = useState("")
  const [ocupado, setOcupado] = useState<"" | "salvando" | "precos">("")
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)

  const aplicar = useCallback((e: Estado) => {
    setEstado(e)
    setNumeros(e.numerosTeste)
  }, [])

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/atendente-virtual")
      if (res.ok) aplicar((await res.json()) as Estado)
    })()
  }, [aplicar])

  const salvar = async (mudanca: Partial<Estado>) => {
    if (!estado || ocupado) return
    setOcupado("salvando")
    setAviso(null)
    try {
      const res = await fetch("/api/admin/atendente-virtual", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ativoNoite: estado.ativoNoite,
          ativoAlmoco: estado.ativoAlmoco,
          numerosTeste: numeros,
          ...mudanca,
        }),
      })
      if (res.ok) {
        aplicar((await res.json()) as Estado)
        setAviso({ ok: true, texto: "Salvo." })
      } else {
        setAviso({ ok: false, texto: "Não foi possível salvar. Tente de novo." })
      }
    } catch {
      setAviso({ ok: false, texto: "Sem conexão. Tente de novo." })
    } finally {
      setOcupado("")
    }
  }

  const atualizarPrecos = async () => {
    if (ocupado) return
    setOcupado("precos")
    setAviso(null)
    try {
      const res = await fetch("/api/admin/atendente-virtual", { method: "POST" })
      const data = (await res.json()) as Estado & { error?: string }
      if (res.ok) {
        aplicar(data)
        setAviso({ ok: true, texto: `Preços atualizados: ${data.precosQtd} produtos lidos do site.` })
      } else {
        setAviso({ ok: false, texto: data.error ?? "Não foi possível ler o site." })
      }
    } catch {
      setAviso({ ok: false, texto: "Sem conexão. Tente de novo." })
    } finally {
      setOcupado("")
    }
  }

  if (!estado) return null

  const chave = (campo: "ativoNoite" | "ativoAlmoco", ligado: boolean, rotulo: string, detalhe: string) => (
    <button
      key={campo}
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={ocupado !== ""}
      onClick={() => void salvar({ [campo]: !ligado })}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left hover:bg-zinc-100 disabled:opacity-60"
    >
      <span>
        <span className="block text-[13px] font-semibold text-zinc-800">{rotulo}</span>
        <span className="block text-[11.5px] text-zinc-500">{detalhe}</span>
      </span>
      <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${ligado ? "bg-emerald-500 text-white" : "bg-zinc-300 text-zinc-700"}`}>
        {ligado ? "LIGADO" : "DESLIGADO"}
      </span>
    </button>
  )

  return (
    <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-[15px] font-semibold text-zinc-900">🤖 Atendente virtual</h2>
      <p className="mt-0.5 text-[12.5px] text-zinc-500">
        Responde o cliente quando a equipe está fora. Usa os preços do site e a base de conhecimento abaixo,
        combina horário pra vendedora ligar e deixa o resumo em <strong>Retornos</strong>. Em horário comercial fica calado.
      </p>

      {!estado.configured && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          ⚠️ A chave da IA não está configurada no servidor — o atendente virtual não responde até configurar.
        </p>
      )}
      {estado.configured && estado.baseVazia && estado.precosQtd === 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
          ⚠️ Sem base de conhecimento e sem preços do site, o atendente não responde (o cliente recebe o aviso de fora do horário). Preencha a base abaixo e atualize os preços.
        </p>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {chave("ativoNoite", estado.ativoNoite, "Noite e fim de semana", "Fora do horário de atendimento")}
        {chave("ativoAlmoco", estado.ativoAlmoco, "Horário de almoço", "Durante a pausa do almoço")}
      </div>

      <div className="mt-4">
        <label htmlFor="av-numeros" className="block text-[12.5px] font-semibold text-zinc-800">Modo teste (opcional)</label>
        <p className="text-[11.5px] text-zinc-500">
          Se preencher, o atendente responde <strong>só</strong> estes números (com DDD, separados por vírgula). Deixe vazio para atender todos.
        </p>
        <div className="mt-1.5 flex gap-2">
          <input
            id="av-numeros"
            value={numeros}
            onChange={(e) => setNumeros(e.target.value)}
            placeholder="Ex.: 43 99999-0000, 43 98888-0000"
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-800 outline-none focus:border-zinc-400 focus:bg-white"
          />
          <button
            type="button"
            onClick={() => void salvar({})}
            disabled={ocupado !== "" || numeros === estado.numerosTeste}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
          >
            {ocupado === "salvando" ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
        <p className="text-[12px] text-zinc-600">
          <strong>Preços do site:</strong>{" "}
          {estado.precosAtualizadosEm
            ? `${estado.precosQtd} produtos · lidos em ${new Date(estado.precosAtualizadosEm).toLocaleString("pt-BR")}`
            : "ainda não lidos"}
          <span className="block text-[11px] text-zinc-400">Atualiza sozinho a cada 12 horas.</span>
        </p>
        <button
          type="button"
          onClick={() => void atualizarPrecos()}
          disabled={ocupado !== ""}
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-[12.5px] font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-50"
        >
          {ocupado === "precos" ? "Lendo o site… (até 1 min)" : "Atualizar preços agora"}
        </button>
      </div>

      {aviso && (
        <p role="status" className={`mt-3 text-[12px] font-medium ${aviso.ok ? "text-emerald-700" : "text-red-600"}`}>
          {aviso.ok ? "✅ " : "⚠️ "}{aviso.texto}
        </p>
      )}
    </section>
  )
}

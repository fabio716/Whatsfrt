"use client"

import { useCallback, useEffect, useState } from "react"
import { quandoTexto } from "../chats/components/Lembretes"
import Mascote from "@/components/ui/Mascote"

// ─── Ciência obrigatória dos retornos ────────────────────────────────────────
// Tela cheia: enquanto houver retorno deixado pelo atendente virtual que a
// vendedora ainda não confirmou, nada do sistema fica disponível. Ela marca
// "Estou ciente" e o aceite fica gravado no servidor (data e hora).

interface Pendente {
  id: string
  dueAt: string
  note: string
  contact: { id: string; name: string; empresa: string | null }
  // Passou do horário e a diretoria já foi avisada.
  atrasado?: boolean
}

const CHECAR_A_CADA_MS = 60_000

export default function RetornosObrigatorio() {
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [confirmou, setConfirmou] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")
  const [agora, setAgora] = useState(0)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/reminders/ciencia", { cache: "no-store" })
      if (!res.ok) return
      const lista = (await res.json()) as Pendente[]
      setAgora(Date.now())
      setPendentes((antes) => {
        // Chegou retorno novo: pede o aceite de novo (a caixa volta desmarcada).
        if (lista.some((l) => !antes.some((a) => a.id === l.id))) setConfirmou(false)
        return lista
      })
    } catch {
      // sem conexão: tenta de novo no próximo ciclo
    }
  }, [])

  useEffect(() => {
    void (async () => { await carregar() })()
    const timer = setInterval(() => void carregar(), CHECAR_A_CADA_MS)
    const aoVoltar = () => { if (document.visibilityState === "visible") void carregar() }
    document.addEventListener("visibilitychange", aoVoltar)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", aoVoltar)
    }
  }, [carregar])

  const aceitar = async () => {
    if (!confirmou || enviando || pendentes.length === 0) return
    setEnviando(true)
    setErro("")
    try {
      const res = await fetch("/api/reminders/ciencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: pendentes.map((p) => p.id) }),
      })
      if (!res.ok) {
        setErro("Não foi possível registrar. Confira a internet e tente de novo.")
        return
      }
      setPendentes([])
      setConfirmou(false)
    } catch {
      setErro("Sem conexão. Tente de novo.")
    } finally {
      setEnviando(false)
    }
  }

  if (pendentes.length === 0) return null
  const temAtraso = pendentes.some((p) => p.atrasado)

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="retornos-titulo">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-zinc-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <Mascote className="h-16 w-16 shrink-0 rounded-2xl" title="Atendente virtual da FRT" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#002d6b]">
                Atendente virtual · aviso obrigatório
              </p>
              <h2 id="retornos-titulo" className="mt-0.5 text-[17px] font-semibold leading-snug text-zinc-900">
                {temAtraso
                  ? "Tem cliente esperando seu retorno!"
                  : pendentes.length === 1 ? "Você tem 1 retorno para fazer" : `Você tem ${pendentes.length} retornos para fazer`}
              </h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-600">
                {temAtraso
                  ? "O horário combinado passou e o retorno não foi concluído. Faça agora e conclua em Retornos."
                  : "Enquanto a equipe estava fora eu conversei com estes clientes e combinei o retorno. Confirma que você viu?"}
              </p>
            </div>
          </div>
          {temAtraso && (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-700">
              ⚠️ A diretoria já recebeu o alerta deste atraso.
            </p>
          )}
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {pendentes.map((p) => (
            <li key={p.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] font-semibold text-zinc-900">
                  {p.contact.name}
                  {p.contact.empresa ? <span className="font-normal text-zinc-500"> · {p.contact.empresa}</span> : null}
                </p>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.atrasado ? "bg-red-100 text-red-700" : "bg-[#00bf5b]/15 text-[#00793a]"}`}>
                  {p.atrasado ? "ATRASADO · " : ""}{quandoTexto(p.dueAt, agora || Date.parse(p.dueAt))}
                </span>
              </div>
              {p.note && <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-600">{p.note}</p>}
            </li>
          ))}
        </ul>

        <div className="border-t border-zinc-100 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3">
            <input
              type="checkbox"
              checked={confirmou}
              onChange={(e) => setConfirmou(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
            />
            <span className="text-[13px] font-medium leading-relaxed text-zinc-800">
              {temAtraso ? "Estou ciente do atraso e vou fazer o retorno agora." : "Estou ciente dos retornos acima e vou entrar em contato no horário combinado."}
            </span>
          </label>
          {erro && <p role="alert" className="mt-2 text-[12px] font-medium text-red-600">⚠️ {erro}</p>}
          <button
            type="button"
            onClick={() => void aceitar()}
            disabled={!confirmou || enviando}
            className="mt-3 w-full rounded-xl bg-[#002d6b] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#0b3f8a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {enviando ? "Registrando…" : "Estou ciente"}
          </button>
        </div>
      </div>
    </div>
  )
}

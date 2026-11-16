"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Mascote from "@/components/ui/Mascote"

// ─── Gerente virtual: alerta com ciência obrigatória ─────────────────────────
// Cliente esperando sem resposta de uma pessoa (tolerância 1 min) ou retorno
// atrasado. A tela fica na frente de tudo até a pessoa dizer "Estou ciente";
// o aceite (quem e quando) fica gravado no servidor.

interface Item {
  id: string
  tipo: "ESPERA_CLIENTE" | "RETORNO_ATRASADO"
  fila: boolean
  contactId: string
  cliente: string
  minutos: number
  toleranciaMin: number
  diretoriaAvisada: boolean
}

const CHECAR_A_CADA_MS = 15_000

export default function GerenteAlerta() {
  const router = useRouter()
  const [itens, setItens] = useState<Item[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/gerente/pendentes", { cache: "no-store" })
      if (!res.ok) return
      setItens((await res.json()) as Item[])
    } catch { /* sem conexão: tenta no próximo ciclo */ }
  }, [])

  useEffect(() => {
    void (async () => { await carregar() })()
    const timer = setInterval(() => void carregar(), CHECAR_A_CADA_MS)
    const aoVoltar = () => { if (document.visibilityState === "visible") void carregar() }
    document.addEventListener("visibilitychange", aoVoltar)
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", aoVoltar) }
  }, [carregar])

  const ciente = async (irPara?: string) => {
    if (enviando || itens.length === 0) return
    setEnviando(true); setErro("")
    try {
      const res = await fetch("/api/gerente/ciencia", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: itens.map((i) => i.id) }),
      })
      if (!res.ok) { setErro("Não foi possível registrar. Confira a internet e tente de novo."); return }
      setItens([])
      if (irPara) router.push(`/admin/chats?contact=${irPara}`)
    } catch {
      setErro("Sem conexão. Tente de novo.")
    } finally { setEnviando(false) }
  }

  if (itens.length === 0) return null
  const primeiro = itens[0]

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="alertdialog" aria-modal="true" aria-labelledby="gerente-titulo">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="border-b border-red-100 bg-red-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <Mascote className="h-14 w-14 shrink-0 rounded-2xl" title="Gerente virtual" humor="preocupado" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700">Gerente virtual · aviso obrigatório</p>
              <h2 id="gerente-titulo" className="mt-0.5 text-[17px] font-semibold leading-snug text-zinc-900">
                {itens.length === 1 ? "Você tem um atraso a resolver" : `Você tem ${itens.length} atrasos a resolver`}
              </h2>
            </div>
          </div>
        </div>

        <ul className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {itens.map((i) => (
            <li key={i.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3">
              <p className="text-[13.5px] font-semibold text-zinc-900">
                {i.tipo === "ESPERA_CLIENTE" ? "⏱️ Cliente esperando: " : "⏰ Retorno atrasado: "}{i.cliente}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-700">
                {i.tipo === "ESPERA_CLIENTE"
                  ? `Está há ${i.minutos} min sem atendimento. Nossa tolerância é de ${i.toleranciaMin} min.`
                  : `O horário combinado passou há ${i.minutos} min e o cliente ainda não teve retorno.`}
                {i.fila ? " (cliente na fila, sem responsável)" : ""}
              </p>
              {i.diretoriaAvisada && <p className="mt-1 text-[12px] font-semibold text-red-700">⚠️ A diretoria já foi avisada.</p>}
            </li>
          ))}
        </ul>

        <div className="border-t border-zinc-100 px-5 py-4">
          {erro && <p role="alert" className="mb-2 text-[12px] font-medium text-red-600">⚠️ {erro}</p>}
          <button
            type="button" onClick={() => void ciente(primeiro.contactId)} disabled={enviando}
            className="w-full rounded-xl bg-[#002d6b] px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-[#0b3f8a] disabled:opacity-50"
          >
            {enviando ? "Registrando…" : "Estou ciente — vou atender agora"}
          </button>
          <p className="mt-2 text-center text-[11px] text-zinc-500">O seu aceite fica registrado com data e hora.</p>
        </div>
      </div>
    </div>
  )
}

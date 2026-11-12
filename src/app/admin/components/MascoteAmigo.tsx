"use client"

import { useEffect, useRef, useState } from "react"
import Mascote from "@/components/ui/Mascote"
import { escolherConversa, type Conversa } from "./mascoteConversas"

// ─── Mascote ocioso ──────────────────────────────────────────────────────────
// Quando ninguém mexe na tela por um tempo, o mascote entra correndo, puxa
// conversa com a pessoa (venda para Vendas, dia a dia para os outros setores)
// e sai. Não grava nada, não envia nada e não atrapalha: o corpo dele não
// recebe clique (só o balão), e qualquer tecla ou clique fora do balão o manda
// embora. Não aparece com janela aberta, aba em segundo plano ou texto sendo
// digitado, e no máximo uma vez a cada 10 minutos.

type Fase = "oculto" | "entrando" | "falando" | "reagindo" | "saindo"

const OCIOSO_MS = 90_000
const ENTRE_VISITAS_MS = 10 * 60_000
const CHAVE_ULTIMA = "mascote_amigo_ultima"
const CHAVE_CONVERSA = "mascote_amigo_conversa"
// Para demonstrar/testar: no console, localStorage.setItem("mascote_ocioso_ms", "5000")
const CHAVE_TESTE = "mascote_ocioso_ms"

const CONFETES = ["🎉", "✨", "🎊", "⭐", "💚", "🎉", "✨", "🚀"]

function lerNumero(chave: string): number {
  try { return Number(localStorage.getItem(chave) ?? 0) || 0 } catch { return 0 }
}
function gravar(chave: string, valor: number): void {
  try { localStorage.setItem(chave, String(valor)) } catch { /* ok */ }
}

function podeAparecer(): boolean {
  if (document.hidden) return false
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
  const el = document.activeElement
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.trim().length > 0) return false
  return true
}

export default function MascoteAmigo() {
  const [fase, setFase] = useState<Fase>("oculto")
  const [conversa, setConversa] = useState<Conversa | null>(null)
  const [resposta, setResposta] = useState("")
  const faseRef = useRef<Fase>("oculto")
  const bolhaRef = useRef<HTMLDivElement>(null)
  const perfilRef = useRef<{ nome: string | null; departamento: string | null; role: string | null }>({ nome: null, departamento: null, role: null })
  const ultimaAtividade = useRef(0)

  const mudar = (f: Fase) => { faseRef.current = f; setFase(f) }

  // Quem é a pessoa (nome e setor) — só pra escolher a conversa.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        if (!res.ok) return
        const m = (await res.json()) as { name?: string; department?: string | null; role?: string }
        perfilRef.current = { nome: m.name ?? null, departamento: m.department ?? null, role: m.role ?? null }
      } catch { /* sem perfil: conversa genérica */ }
    })()
  }, [])

  // Detecta tela parada e inicia a visita.
  useEffect(() => {
    ultimaAtividade.current = Date.now()
    const agiu = (e: Event) => {
      // Mexer o mouse perto do balão não espanta o mascote; o resto, sim.
      if (faseRef.current === "falando" || faseRef.current === "reagindo") {
        const dentro = bolhaRef.current?.contains(e.target as Node) ?? false
        if (!dentro && (e.type === "keydown" || e.type === "pointerdown")) mudar("saindo")
        return
      }
      if (faseRef.current === "entrando" && (e.type === "keydown" || e.type === "pointerdown")) mudar("saindo")
      ultimaAtividade.current = Date.now()
    }
    const eventos = ["mousemove", "keydown", "pointerdown", "wheel", "touchstart"] as const
    for (const ev of eventos) window.addEventListener(ev, agiu, { passive: true })

    const timer = setInterval(() => {
      if (faseRef.current !== "oculto") return
      const limite = lerNumero(CHAVE_TESTE) || OCIOSO_MS
      const parado = Date.now() - ultimaAtividade.current >= limite
      const folga = Date.now() - lerNumero(CHAVE_ULTIMA) >= (lerNumero(CHAVE_TESTE) ? 0 : ENTRE_VISITAS_MS)
      if (!parado || !folga || !podeAparecer()) return
      const { conversa: c, indice } = escolherConversa(perfilRef.current, lerNumero(CHAVE_CONVERSA) - 1)
      gravar(CHAVE_CONVERSA, indice + 1)
      gravar(CHAVE_ULTIMA, Date.now())
      setConversa(c)
      setResposta("")
      mudar("entrando")
    }, 3000)

    return () => {
      clearInterval(timer)
      for (const ev of eventos) window.removeEventListener(ev, agiu)
    }
  }, [])

  // Passos da visita.
  useEffect(() => {
    const tempos: Record<string, [number, Fase]> = {
      entrando: [4200, "falando"],
      falando: [18_000, "saindo"],
      reagindo: [4500, "saindo"],
      saindo: [3600, "oculto"],
    }
    const passo = tempos[fase]
    if (!passo) return
    const t = setTimeout(() => {
      if (passo[1] === "oculto") ultimaAtividade.current = Date.now()
      mudar(passo[1])
    }, passo[0])
    return () => clearTimeout(t)
  }, [fase])

  if (fase === "oculto" || !conversa) return null
  const correndo = fase === "entrando" || fase === "saindo"

  return (
    <div
      aria-live="polite"
      className={`pointer-events-none fixed bottom-2 z-[75] ${fase === "entrando" ? "amigo-entrando" : fase === "saindo" ? "amigo-saindo" : "amigo-parado"}`}
    >
      {(fase === "falando" || fase === "reagindo") && (
        <div
          ref={bolhaRef}
          className="pointer-events-auto absolute bottom-[124px] sm:bottom-[142px] left-1/2 w-[15.5rem] -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white px-3.5 py-3 shadow-xl anim-slide-up"
        >
          <button
            type="button"
            onClick={() => mudar("saindo")}
            aria-label="Dispensar o mascote"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            ✕
          </button>
          <p className="pr-5 text-[13px] font-medium leading-snug text-zinc-800">
            {fase === "reagindo" ? resposta : conversa.texto}
          </p>
          {fase === "falando" && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {conversa.opcoes.map((o) => (
                <button
                  key={o.rotulo}
                  type="button"
                  onClick={() => { setResposta(o.resposta); mudar("reagindo") }}
                  className="rounded-full bg-[#002d6b] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#0b3f8a]"
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
          )}
          <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-zinc-200 bg-white" />
        </div>
      )}

      {fase === "reagindo" && (
        <div aria-hidden className="absolute bottom-28 left-1/2 h-0 w-0">
          {CONFETES.map((c, i) => (
            <span key={i} className="amigo-confete absolute text-xl" style={{ ["--dx" as string]: `${(i - 3.5) * 22}px`, animationDelay: `${i * 70}ms` }}>{c}</span>
          ))}
        </div>
      )}

      <div className={correndo ? "amigo-corre" : fase === "reagindo" ? "amigo-pulo" : ""}>
        <Mascote
          className="h-24 w-24 sm:h-28 sm:w-28 drop-shadow-lg"
          title="Mascote da FRT"
          fundo={false}
          reage={false}
          correndo={correndo}
          humor={fase === "reagindo" ? "comemorando" : "feliz"}
        />
      </div>
    </div>
  )
}

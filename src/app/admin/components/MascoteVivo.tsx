"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Mascote, { type Humor } from "@/components/ui/Mascote"
import Mascote3D, { type Animacao3D } from "@/components/ui/Mascote3D"
import { escolherConversa } from "./mascoteConversas"
import {
  BOLINHA_CONVITE, BOLINHA_PEGOU, BOLINHA_PERDEU, ESPIAR_FALAS, SHOW_ABERTURA, SHOW_FINAL, preencher, sortear,
} from "./mascoteRepertorio"
import { FALAS, textoCobranca, textoFesta, type ItemCobranca } from "./mascoteTexto"

// ─── Mascote vivo ────────────────────────────────────────────────────────────
// O colega de tela da equipe. Duas famílias de cena:
//  • COBRANÇA (a pessoa tem retorno vencido ou prestes a vencer e ainda não
//    respondeu o cliente): ele vem correndo pedir que atenda, mais aflito
//    conforme o atraso ("senão eu levo bronca"). Quando ela atende, comemora.
//  • BRINCADEIRA (tela parada): bolinha que quica (dá pra clicar), cambalhota,
//    dança, espiar pelo canto, papo do dia.
// Só a própria pessoa vê. Nada é gravado nem enviado, exceto o botão "Liguei por
// telefone", que marca o retorno como feito (igual ao "Fiz o retorno").
// Limites: cobra no máximo a cada 8 min (adia 15), brinca a cada 6 min, não
// aparece com janela aberta, aba em segundo plano ou texto sendo digitado, e dá
// pra silenciar/desligar (menu lateral, "Mascote").

type Cena = "cobranca" | "conversa" | "bolinha" | "show" | "espiar" | "festa"
type Dir = "esq" | "dir" | null
interface Fala { texto: string; opcoes: { rotulo: string; id: string }[]; dx: number }
interface Prefs { desligado: boolean; silenciarAte: number }

const OCIOSO_MS = 90_000
const ENTRE_CENAS_MS = 6 * 60_000
const ENTRE_COBRANCAS_MS = 8 * 60_000
const ADIAR_MS = 15 * 60_000
const VERIFICAR_MS = 45_000

export const CHAVE_PREFS = "mascote_prefs"
export const EVENTO_PREFS = "mascote:prefs"
export const EVENTO_CHAMAR = "mascote:chamar"
const K = { ultima: "mascote_vivo_ultima", cobrancaAte: "mascote_cobranca_ate", teste: "mascote_ocioso_ms", bolinhas: "mascote_bolinhas", conversa: "mascote_amigo_conversa" }
const CONFETES = ["🎉", "✨", "🎊", "⭐", "💚", "🎉", "✨", "🚀"]

const lerNum = (k: string): number => { try { return Number(localStorage.getItem(k) ?? 0) || 0 } catch { return 0 } }
const gravar = (k: string, v: number): void => { try { localStorage.setItem(k, String(v)) } catch { /* ok */ } }
export function lerPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PREFS) ?? "{}") as Partial<Prefs>
    return { desligado: p.desligado === true, silenciarAte: Number(p.silenciarAte ?? 0) || 0 }
  } catch { return { desligado: false, silenciarAte: 0 } }
}
export function gravarPrefs(p: Prefs): void {
  try { localStorage.setItem(CHAVE_PREFS, JSON.stringify(p)) } catch { /* ok */ }
  window.dispatchEvent(new Event(EVENTO_PREFS))
}

function podeAparecer(): boolean {
  if (document.hidden) return false
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return false
  const el = document.activeElement
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.trim().length > 0) return false
  return true
}

// WebGL disponível? Sem ele, fica o mascote 2D.
function temWebGL(): boolean {
  try {
    const c = document.createElement("canvas")
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"))
  } catch { return false }
}

// Humor/ação da cena → animação e rosto do robô 3D.
function animacaoPara(humor: Humor, correndo: boolean, acao: string): Animacao3D {
  if (correndo) return "correr"
  if (acao === "danca") return "dancar"
  if (acao === "cambalhota" || acao === "pulo") return "pular"
  if (humor === "comemorando") return "dancar"
  if (humor === "preocupado") return "nao"
  if (humor === "pedindo") return "pedir"
  if (humor === "dormindo") return "sentar"
  return "idle"
}
const reduzido = (): boolean => window.matchMedia("(prefers-reduced-motion: reduce)").matches
const quadro = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()))

// ─── Bolinha que quica ───────────────────────────────────────────────────────
function Bolinha({ origem, pos, onPegou, onFim }: Readonly<{
  origem: { x: number; y: number }
  pos: { current: { x: number; y: number } }
  onPegou: () => void
  onFim: () => void
}>) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const R = 18
    let x = origem.x
    let y = origem.y
    let vx = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 180)
    let vy = -(780 + Math.random() * 200)
    const t0 = performance.now()
    let ultimo = t0
    let raf = 0
    const passo = (t: number) => {
      const dt = Math.min(0.032, (t - ultimo) / 1000)
      ultimo = t
      vy += 1900 * dt
      x += vx * dt
      y += vy * dt
      const chao = window.innerHeight - 8 - 2 * R
      if (y > chao) { y = chao; vy = -vy * 0.74; vx *= 0.93; if (Math.abs(vy) < 110) vy = 0 }
      if (x < 0) { x = 0; vx = Math.abs(vx) * 0.85 }
      if (x > window.innerWidth - 2 * R) { x = window.innerWidth - 2 * R; vx = -Math.abs(vx) * 0.85 }
      pos.current = { x: x + R, y: y + R }
      if (ref.current) ref.current.style.transform = `translate(${x}px, ${y}px)`
      if (t - t0 > 9000) { onFim(); return }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [origem, pos, onFim])

  return (
    <button
      ref={ref}
      type="button"
      data-mascote
      onClick={onPegou}
      aria-label="Pegar a bolinha do mascote"
      className="fixed left-0 top-0 z-[76] h-9 w-9 cursor-pointer rounded-full shadow-lg"
      style={{ background: "radial-gradient(circle at 35% 30%, #d6ffe6, #00bf5b 55%, #007a3a)", boxShadow: "0 6px 12px rgba(0,45,107,.35), inset -3px -4px 6px rgba(0,60,30,.35)" }}
    />
  )
}

export default function MascoteVivo() {
  const router = useRouter()
  const [visivel, setVisivel] = useState(false)
  const [humor, setHumor] = useState<Humor>("feliz")
  const [correndo, setCorrendo] = useState(false)
  const [direcao, setDirecao] = useState<Dir>(null)
  const [acao, setAcao] = useState("")
  const [fala, setFala] = useState<Fala | null>(null)
  const [festa, setFesta] = useState(false)
  const [bola, setBola] = useState<{ x: number; y: number } | null>(null)
  const [usar3d, setUsar3d] = useState(false)
  const [falando, setFalando] = useState(false)
  const elRef = useRef<HTMLDivElement>(null)
  const bolaRef = useRef({ x: 0, y: 0 })
  const escolhaRef = useRef<((id: string) => void) | null>(null)
  const bolaFimRef = useRef<((pegou: boolean) => void) | null>(null)

  // Toda a "direção" das cenas vive aqui dentro (só usa refs e setters estáveis).
  useEffect(() => {
    const tam = () => (window.innerWidth >= 640 ? 160 : 120)
    let x = -400
    let sessao = 0
    let cenaAtual: Cena | null = null
    let ocupado = false
    let ultimaAtividade = Date.now()
    let perfil: { nome: string | null; departamento: string | null; role: string | null } = { nome: null, departamento: null, role: null }
    const cancelers: (() => void)[] = []
    const cobrados = new Set<string>()
    let cobrancaPendente = false // havia cobrança, mas uma janela aberta segurou: vem logo que fechar

    const vivo = (id: number) => sessao === id
    const posicionar = (px: number) => { x = px; if (elRef.current) elRef.current.style.left = `${px}px` }
    const cancelar = () => {
      sessao += 1
      for (const c of cancelers.splice(0)) c()
    }
    const esperar = (ms: number): Promise<void> => new Promise((res) => {
      const t = setTimeout(res, ms)
      cancelers.push(() => { clearTimeout(t); res() })
    })
    const limpar = () => {
      setVisivel(false); setFalando(false); setFala(null); setBola(null); setFesta(false); setAcao(""); setCorrendo(false); setDirecao(null)
      escolhaRef.current = null
      bolaFimRef.current = null
      x = -400
      ultimaAtividade = Date.now()
    }

    // Corre até `destino` (px) numa velocidade (px/s). Sem animação, teletransporta.
    const mover = (destino: number, vel: number, id: number): Promise<void> => new Promise((res) => {
      const inicio = x
      const dist = destino - inicio
      if (Math.abs(dist) < 2 || reduzido()) { posicionar(destino); res(); return }
      const dur = (Math.abs(dist) / vel) * 1000
      const t0 = performance.now()
      setDirecao(dist > 0 ? "dir" : "esq")
      setCorrendo(true)
      let raf = 0
      const passo = (t: number) => {
        if (!vivo(id)) { res(); return }
        const k = Math.min(1, (t - t0) / dur)
        posicionar(inicio + dist * k)
        if (k < 1) raf = requestAnimationFrame(passo)
        else { setCorrendo(false); res() }
      }
      raf = requestAnimationFrame(passo)
      cancelers.push(() => { cancelAnimationFrame(raf); res() })
    })

    const entrar = async (id: number, destino: number, h: Humor) => {
      setHumor(h); setVisivel(true)
      await quadro(); await quadro()
      posicionar(-tam() - 30)
      await mover(destino, 520, id)
      setCorrendo(false); setDirecao(null)
    }
    const sair = async (id: number) => {
      setFala(null); setHumor("feliz")
      await mover(window.innerWidth + tam() + 40, 560, id)
    }
    const mexerBoca = (texto: string) => {
      setFalando(true)
      const t = setTimeout(() => setFalando(false), Math.min(4000, 900 + texto.length * 55))
      cancelers.push(() => clearTimeout(t))
    }
    const dizer = async (texto: string, ms: number) => {
      const cx = x + tam() / 2
      const meio = Math.min(Math.max(cx, 150), window.innerWidth - 150)
      setFala({ texto, opcoes: [], dx: meio - cx })
      mexerBoca(texto)
      await esperar(ms)
    }
    // Fala com botões; devolve o id escolhido ou null se ninguém respondeu.
    const perguntar = (texto: string, opcoes: Fala["opcoes"], ms: number): Promise<string | null> => new Promise((res) => {
      const cx = x + tam() / 2
      const meio = Math.min(Math.max(cx, 150), window.innerWidth - 150)
      setFala({ texto, opcoes, dx: meio - cx })
      mexerBoca(texto)
      const t = setTimeout(() => { escolhaRef.current = null; res(null) }, ms)
      escolhaRef.current = (op) => { clearTimeout(t); escolhaRef.current = null; res(op) }
      cancelers.push(() => { clearTimeout(t); escolhaRef.current = null; res(null) })
    })
    const fazer = async (nome: string, ms: number) => { setAcao(nome); await esperar(ms); setAcao("") }

    // ── Cenas ──────────────────────────────────────────────────────────────
    const cenaCobranca = async (id: number, itens: ItemCobranca[]) => {
      const t = textoCobranca(perfil.nome, itens)
      await entrar(id, Math.round(window.innerWidth * 0.34), t.humor)
      if (!vivo(id)) return
      if (t.humor === "preocupado") setAcao("tremor")
      const escolha = await perguntar(t.texto, t.opcoes, 40_000)
      if (!vivo(id)) return
      setAcao("")
      if (escolha === "agora") {
        setHumor("comemorando")
        router.push(`/admin/chats?contact=${itens[0].contactId}`)
        await dizer(FALAS.agora, 1900)
      } else if (escolha === "telefone") {
        setHumor("feliz")
        void fetch(`/api/reminders/${itens[0].id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: true }) }).catch(() => {})
        await dizer(FALAS.telefone, 4200)
      } else if (escolha === "depois") {
        gravar(K.cobrancaAte, Date.now() + ADIAR_MS)
        setHumor("preocupado")
        await dizer(FALAS.depois, 2200)
      } else {
        setHumor("pedindo")
        await dizer(FALAS.ignorou, 1800)
      }
      if (vivo(id)) await sair(id)
    }

    const cenaFesta = async (id: number, qtd: number) => {
      await entrar(id, Math.round(window.innerWidth * 0.4), "comemorando")
      if (!vivo(id)) return
      setFesta(true); setAcao("pulo")
      await dizer(textoFesta(qtd), 4200)
      setFesta(false); setAcao("")
      if (vivo(id)) await sair(id)
    }

    const cenaConversa = async (id: number) => {
      const { conversa, indice } = escolherConversa(perfil)
      gravar(K.conversa, indice + 1)
      await entrar(id, Math.round(window.innerWidth * 0.4), "feliz")
      if (!vivo(id)) return
      const escolha = await perguntar(conversa.texto, conversa.opcoes.map((o, i) => ({ rotulo: o.rotulo, id: String(i) })), 18_000)
      if (!vivo(id)) return
      if (escolha !== null && escolha !== "fechar") {
        setHumor("comemorando"); setFesta(true); setAcao("pulo")
        await dizer(conversa.opcoes[Number(escolha)]?.resposta ?? "😄", 3800)
        setFesta(false); setAcao("")
      }
      if (vivo(id)) await sair(id)
    }

    const cenaBolinha = async (id: number) => {
      await entrar(id, Math.round(window.innerWidth * 0.3), "feliz")
      if (!vivo(id)) return
      await dizer(sortear("bolinha_convite", BOLINHA_CONVITE).item, 1500)
      if (!vivo(id)) return
      setFala(null)
      bolaRef.current = { x: x + tam() * 0.7, y: window.innerHeight - tam() }
      const pegou = await new Promise<boolean>((res) => {
        bolaFimRef.current = (p) => { bolaFimRef.current = null; res(p) }
        cancelers.push(() => res(false))
        setBola({ x: x + tam() * 0.7, y: window.innerHeight - tam() * 1.1 })
        // O mascote corre atrás da bolinha.
        let raf = 0
        let ultimo = performance.now()
        const perseguir = (t: number) => {
          if (!vivo(id) || bolaFimRef.current === null) return
          const dt = Math.min(0.05, (t - ultimo) / 1000)
          ultimo = t
          const alvo = bolaRef.current.x - tam() / 2
          const dx = alvo - x
          const passo = Math.max(-480 * dt, Math.min(480 * dt, dx))
          posicionar(x + passo)
          setDirecao(Math.abs(dx) > 10 ? (dx > 0 ? "dir" : "esq") : null)
          setCorrendo(Math.abs(dx) > 10)
          raf = requestAnimationFrame(perseguir)
        }
        raf = requestAnimationFrame(perseguir)
        cancelers.push(() => cancelAnimationFrame(raf))
      })
      setBola(null); setCorrendo(false); setDirecao(null)
      if (!vivo(id)) return
      if (pegou) {
        const total = lerNum(K.bolinhas) + 1
        gravar(K.bolinhas, total)
        setHumor("comemorando"); setFesta(true); setAcao("pulo")
        await dizer(preencher(sortear("bolinha_pegou", BOLINHA_PEGOU).item, { total: String(total), bolinhas: total === 1 ? "bolinha" : "bolinhas" }), 3200)
        setFesta(false); setAcao("")
      } else {
        setHumor("feliz")
        await dizer(sortear("bolinha_perdeu", BOLINHA_PERDEU).item, 2200)
      }
      if (vivo(id)) await sair(id)
    }

    const cenaShow = async (id: number) => {
      await entrar(id, Math.round(window.innerWidth * 0.45), "feliz")
      if (!vivo(id)) return
      await dizer(sortear("show_abertura", SHOW_ABERTURA).item, 1200)
      setFala(null)
      setHumor("comemorando")
      if (!reduzido()) { await fazer("cambalhota", 1000); if (!vivo(id)) return }
      setHumor("feliz"); setAcao("virar"); await esperar(550); setAcao("")
      if (!vivo(id)) return
      setHumor("comemorando"); setAcao("danca")
      await dizer(sortear("show_final", SHOW_FINAL).item, 3000)
      setAcao("")
      if (vivo(id)) await sair(id)
    }

    const cenaEspiar = async (id: number) => {
      const t = tam()
      setHumor("surpreso"); setVisivel(true)
      await quadro(); await quadro()
      posicionar(-t - 30)
      await mover(-t * 0.45, 260, id)
      if (!vivo(id)) return
      setDirecao("dir"); setCorrendo(false)
      await dizer(sortear("espiar", ESPIAR_FALAS).item, 2300)
      setFala(null)
      setAcao("virar"); await esperar(500); setAcao("")
      setHumor("feliz")
      if (vivo(id)) await mover(-t - 40, 260, id)
    }

    // Roda uma cena de cada vez; cancelável (tecla/clique) nas brincadeiras.
    const rodar = async (cena: Cena, fn: (id: number) => Promise<void>) => {
      if (ocupado) return
      ocupado = true
      cenaAtual = cena
      sessao += 1
      const id = sessao
      try { await fn(id) } catch { /* cena cancelada */ } finally {
        limpar()
        cenaAtual = null
        ocupado = false
      }
    }

    // ── Gatilhos ───────────────────────────────────────────────────────────
    const buscarCobranca = async (): Promise<ItemCobranca[] | null> => {
      try {
        const res = await fetch("/api/reminders/cobranca", { cache: "no-store" })
        return res.ok ? ((await res.json()) as ItemCobranca[]) : null
      } catch { return null }
    }

    const verificarCobranca = async () => {
      if (lerPrefs().desligado || ocupado) return
      const itens = await buscarCobranca()
      if (itens === null || ocupado) return
      // Quem foi cobrado e já saiu da lista (respondeu o cliente ou concluiu): festa.
      const sumidos = [...cobrados].filter((cid) => !itens.some((i) => i.id === cid))
      if (sumidos.length > 0 && podeAparecer()) {
        sumidos.forEach((s) => cobrados.delete(s))
        void rodar("festa", (id) => cenaFesta(id, sumidos.length))
        return
      }
      if (itens.length === 0) return
      if (Date.now() < lerNum(K.cobrancaAte)) return
      if (!podeAparecer()) { cobrancaPendente = true; return }
      cobrancaPendente = false
      gravar(K.cobrancaAte, Date.now() + ENTRE_COBRANCAS_MS)
      itens.forEach((i) => cobrados.add(i.id))
      void rodar("cobranca", (id) => cenaCobranca(id, itens))
    }

    const sortearBrincadeira = (): Cena => {
      // Demonstração: localStorage.setItem("mascote_cena_teste", "bolinha") força a cena.
      const forcada = (() => { try { return localStorage.getItem("mascote_cena_teste") } catch { return null } })()
      if (forcada && ["conversa", "bolinha", "show", "espiar"].includes(forcada)) return forcada as Cena
      const opcoes: Cena[] = reduzido() ? ["conversa", "espiar"] : ["conversa", "bolinha", "bolinha", "show", "show", "espiar"]
      return opcoes[Math.floor(Math.random() * opcoes.length)]
    }

    const verificarOcio = () => {
      if (ocupado) return
      if (cobrancaPendente && podeAparecer()) { cobrancaPendente = false; void verificarCobranca(); return }
      const p = lerPrefs()
      if (p.desligado || Date.now() < p.silenciarAte) return
      const teste = lerNum(K.teste)
      const limite = teste || OCIOSO_MS
      if (Date.now() - ultimaAtividade < limite) return
      if (!teste && Date.now() - lerNum(K.ultima) < ENTRE_CENAS_MS) return
      if (!podeAparecer()) return
      gravar(K.ultima, Date.now())
      brincar()
    }

    const brincar = () => {
      const cena = sortearBrincadeira()
      const fn = { conversa: cenaConversa, bolinha: cenaBolinha, show: cenaShow, espiar: cenaEspiar }[cena as "conversa"]
      void rodar(cena, fn)
    }

    // Botão "Chamar agora" (menu lateral): cobra se houver retorno pendente; senão brinca.
    const aoChamar = async () => {
      if (lerPrefs().desligado || ocupado) return
      const itens = await buscarCobranca()
      if (ocupado) return
      if (itens && itens.length > 0) {
        itens.forEach((i) => cobrados.add(i.id))
        gravar(K.cobrancaAte, Date.now() + ENTRE_COBRANCAS_MS)
        void rodar("cobranca", (id) => cenaCobranca(id, itens))
        return
      }
      brincar()
    }

    // Atividade da pessoa: tecla/clique fora do mascote encerra as brincadeiras.
    const agiu = (e: Event) => {
      const dentro = (e.target as HTMLElement | null)?.closest?.("[data-mascote]") != null
      if (ocupado && cenaAtual !== "cobranca" && cenaAtual !== "festa" && !dentro && (e.type === "keydown" || e.type === "pointerdown")) cancelar()
      if (!ocupado) ultimaAtividade = Date.now()
    }
    const eventos = ["mousemove", "keydown", "pointerdown", "wheel", "touchstart"] as const
    for (const ev of eventos) window.addEventListener(ev, agiu, { passive: true })

    const aoMudarPrefs = () => { if (lerPrefs().desligado && ocupado) cancelar() }
    window.addEventListener(EVENTO_PREFS, aoMudarPrefs)
    window.addEventListener(EVENTO_CHAMAR, aoChamar)

    void (async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" })
        if (res.ok) {
          const m = (await res.json()) as { name?: string; department?: string | null; role?: string }
          perfil = { nome: m.name ?? null, departamento: m.department ?? null, role: m.role ?? null }
        }
      } catch { /* sem perfil: fala genérica */ }
    })()

    void (async () => {
      await quadro()
      setUsar3d(!reduzido() && temWebGL())
    })()

    const primeira = setTimeout(() => void verificarCobranca(), 4000)
    const tCobranca = setInterval(() => void verificarCobranca(), VERIFICAR_MS)
    const tOcio = setInterval(verificarOcio, 3000)

    return () => {
      clearTimeout(primeira); clearInterval(tCobranca); clearInterval(tOcio)
      for (const ev of eventos) window.removeEventListener(ev, agiu)
      window.removeEventListener(EVENTO_PREFS, aoMudarPrefs)
      window.removeEventListener(EVENTO_CHAMAR, aoChamar)
      cancelar()
    }
  }, [router])

  if (!visivel) return null

  const classeAcao = usar3d ? "" : correndo ? "amigo-corre" : acao === "pulo" ? "amigo-pulo" : acao === "cambalhota" ? "amigo-cambalhota" : acao === "danca" ? "amigo-danca" : acao === "virar" ? "amigo-virar" : acao === "tremor" ? "amigo-tremor" : ""

  return (
    <>
      <div ref={elRef} aria-live="polite" className="pointer-events-none fixed bottom-1 z-[75]" style={{ left: -400 }}>
        {fala && (
          <div
            data-mascote
            className={`pointer-events-auto absolute left-1/2 w-[17rem] rounded-2xl border border-zinc-200 bg-white px-3.5 py-3 shadow-xl anim-slide-up ${usar3d ? "bottom-[184px] sm:bottom-[240px]" : "bottom-[130px] sm:bottom-[150px]"}`}
            style={{ transform: `translateX(calc(-50% + ${fala.dx}px))` }}
          >
            <button
              type="button"
              onClick={() => { if (escolhaRef.current) escolhaRef.current("fechar"); else setFala(null) }}
              aria-label="Dispensar o mascote"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              ✕
            </button>
            <p className="pr-5 text-[13px] font-medium leading-snug text-zinc-800">{fala.texto}</p>
            {fala.opcoes.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {fala.opcoes.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => escolhaRef.current?.(o.id)}
                    className="rounded-full bg-[#002d6b] px-3 py-1 text-[12px] font-semibold text-white hover:bg-[#0b3f8a]"
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => { const p = lerPrefs(); gravarPrefs({ ...p, silenciarAte: Date.now() + 60 * 60_000 }); escolhaRef.current?.("fechar") }}
              className="mt-2 block text-[11px] text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
            >
              Silenciar brincadeiras por 1 hora
            </button>
            <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-zinc-200 bg-white" style={{ marginLeft: -fala.dx }} />
          </div>
        )}

        {festa && (
          <div aria-hidden className="absolute left-1/2 h-0 w-0 bottom-32 sm:bottom-44">
            {CONFETES.map((c, i) => (
              <span key={i} className="amigo-confete absolute text-xl" style={{ ["--dx" as string]: `${(i - 3.5) * 24}px`, animationDelay: `${i * 70}ms` }}>{c}</span>
            ))}
          </div>
        )}

        <div className={classeAcao}>
          {usar3d ? (
            <div className="relative">
              <div aria-hidden className="absolute bottom-[3px] left-1/2 h-3 w-16 -translate-x-1/2 rounded-full bg-black/25 blur-[3px] sm:w-20" />
              <Mascote3D
                className="relative h-44 w-[7.5rem] sm:h-56 sm:w-40"
                animacao={animacaoPara(humor, correndo, acao)}
                humor={humor}
                falando={falando}
                direcao={direcao}
                onErro={() => setUsar3d(false)}
              />
            </div>
          ) : (
            <Mascote
              className="h-24 w-24 drop-shadow-lg sm:h-32 sm:w-32"
              title="Mascote da FRT"
              fundo={false}
              reage={false}
              correndo={correndo}
              direcao={direcao}
              humor={humor}
            />
          )}
        </div>
      </div>

      {bola && (
        <Bolinha
          origem={bola}
          pos={bolaRef}
          onPegou={() => bolaFimRef.current?.(true)}
          onFim={() => bolaFimRef.current?.(false)}
        />
      )}
    </>
  )
}

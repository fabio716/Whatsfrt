"use client"

import { useEffect, useId, useRef, useState, type CSSProperties } from "react"

// ─── Mascote da FRT ──────────────────────────────────────────────────────────
// Robô simpático nas cores da logo (verde e azul-marinho), desenhado em SVG.
//  • humor: normal, feliz, pensando, comemorando, dormindo ou surpreso;
//  • os olhos seguem o mouse (só com animação ligada);
//  • passar o mouse alegra ele; clicar faz ele comemorar;
//  • correndo: usa os pezinhos (quem usa é o mascote ocioso);
//  • fundo={false}: personagem solto, sem o quadrado de fundo.
// As animações ficam em globals.css (classes mascote-*).

export type Humor = "normal" | "feliz" | "pensando" | "comemorando" | "dormindo" | "surpreso" | "preocupado" | "pedindo"

interface Pose { esq: number; dir: number; ola: boolean }
const POSES: Record<Humor, Pose> = {
  normal: { esq: 24, dir: -128, ola: true },
  feliz: { esq: 28, dir: -132, ola: true },
  pensando: { esq: 22, dir: -22, ola: false },
  comemorando: { esq: 152, dir: -152, ola: false },
  dormindo: { esq: 12, dir: -12, ola: false },
  surpreso: { esq: 64, dir: -64, ola: false },
  preocupado: { esq: 38, dir: -38, ola: false },
  pedindo: { esq: 132, dir: -132, ola: false },
}

// Estrela de 5 pontas (olhos de quem comemora).
function estrela(cx: number, cy: number, R: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2
    const raio = i % 2 === 0 ? R : r
    pts.push(`${(cx + raio * Math.cos(ang)).toFixed(1)},${(cy + raio * Math.sin(ang)).toFixed(1)}`)
  }
  return pts.join(" ")
}

const ESTILO_BRACO = (x: number, graus: number): CSSProperties => ({
  transform: `translate(${x}px, 572px) rotate(${graus}deg)`,
  transition: "transform .35s cubic-bezier(.3,1.4,.5,1)",
})

export default function Mascote({
  className = "h-12 w-12",
  title = "",
  animado = true,
  humor = "normal",
  fundo = true,
  correndo = false,
  olhar = true,
  reage = true,
  direcao = null,
}: Readonly<{
  className?: string
  title?: string
  animado?: boolean
  humor?: Humor
  fundo?: boolean
  correndo?: boolean
  olhar?: boolean
  reage?: boolean
  direcao?: "esq" | "dir" | null
}>) {
  const id = useId().replace(/:/g, "")
  const svgRef = useRef<SVGSVGElement>(null)
  const [reacao, setReacao] = useState<Humor | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const atual: Humor = reacao ?? humor
  const pose = POSES[atual]

  // Olhos seguem o mouse: só mexe numa variável CSS (não re-renderiza).
  useEffect(() => {
    if (!olhar || !animado) return
    const svg = svgRef.current
    if (!svg) return
    let raf = 0
    let px = 0
    let py = 0
    const aplicar = () => {
      raf = 0
      const r = svg.getBoundingClientRect()
      if (r.width === 0) return
      const dx = px - (r.left + r.width / 2)
      const dy = py - (r.top + r.height * 0.42)
      const d = Math.hypot(dx, dy) || 1
      const alcance = Math.min(1, d / 280)
      svg.style.setProperty("--olho-x", `${((dx / d) * alcance * 12).toFixed(1)}px`)
      svg.style.setProperty("--olho-y", `${((dy / d) * alcance * 9).toFixed(1)}px`)
    }
    const mover = (e: PointerEvent) => {
      px = e.clientX
      py = e.clientY
      if (!raf) raf = requestAnimationFrame(aplicar)
    }
    window.addEventListener("pointermove", mover, { passive: true })
    return () => {
      window.removeEventListener("pointermove", mover)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [olhar, animado])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const alegrar = () => { if (reage && !timer.current) setReacao("feliz") }
  const acalmar = () => { if (reage && !timer.current) setReacao(null) }
  const comemorar = () => {
    if (!reage) return
    if (timer.current) clearTimeout(timer.current)
    setReacao("comemorando")
    timer.current = setTimeout(() => { timer.current = null; setReacao(null) }, 1600)
  }

  const corpo = `mc${id}`
  const tela = `mt${id}`
  const fundoId = `mf${id}`
  const bolaId = `mb${id}`
  const abertos = atual === "normal" || atual === "pensando" || atual === "surpreso" || atual === "preocupado" || atual === "pedindo"
  const olhosGrandes = atual === "surpreso" || atual === "pedindo"
  const sorrisoGrande = atual === "feliz" || atual === "comemorando"
  const desvioX = (atual === "pensando" ? 16 : 0) + (direcao === "dir" ? 14 : direcao === "esq" ? -14 : 0)
  const desvioY = atual === "pensando" ? -14 : 0
  const olhos: CSSProperties = {
    transform: `translate(calc(var(--olho-x, 0px) + ${desvioX}px), calc(var(--olho-y, 0px) + ${desvioY}px))`,
    transition: "transform .14s ease-out",
  }

  return (
    <svg
      ref={svgRef}
      viewBox={fundo ? "0 0 800 800" : "30 30 740 740"}
      className={`${className} shrink-0 ${animado ? "mascote-anim" : ""} ${correndo ? "mascote-correndo" : ""} ${reage ? "cursor-pointer" : ""}`}
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      onPointerEnter={alegrar}
      onPointerLeave={acalmar}
      onPointerDown={comemorar}
    >
      <defs>
        <linearGradient id={fundoId} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1fbf5" /><stop offset="1" stopColor="#d6f3e2" /></linearGradient>
        <linearGradient id={corpo} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b5cb8" /><stop offset=".55" stopColor="#0b3f8a" /><stop offset="1" stopColor="#002d6b" /></linearGradient>
        <linearGradient id={tela} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a2247" /><stop offset="1" stopColor="#04122b" /></linearGradient>
        <radialGradient id={bolaId} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#b6ffd3" /><stop offset=".5" stopColor="#00d96a" /><stop offset="1" stopColor="#00a04a" /></radialGradient>
      </defs>

      {fundo && <rect width="800" height="800" rx="120" fill={`url(#${fundoId})`} />}
      <ellipse className="mascote-sombra" cx="400" cy="748" rx="200" ry="22" fill="#002d6b" opacity=".16" />

      <g className="mascote-pessoa">
        {/* pezinhos */}
        <g className="mascote-pe-a"><ellipse cx="318" cy="722" rx="64" ry="26" fill="#002d6b" /><ellipse cx="318" cy="736" rx="52" ry="10" fill="#00bf5b" /></g>
        <g className="mascote-pe-b"><ellipse cx="482" cy="722" rx="64" ry="26" fill="#002d6b" /><ellipse cx="482" cy="736" rx="52" ry="10" fill="#00bf5b" /></g>

        {/* antena */}
        <rect x="392" y="92" width="16" height="76" rx="8" fill="#002d6b" />
        <g className="mascote-bola">
          <circle cx="400" cy="84" r="44" fill="#3ee08a" opacity=".22" />
          <circle cx="400" cy="84" r="27" fill={`url(#${bolaId})`} />
          <circle cx="391" cy="74" r="8" fill="#fff" opacity=".75" />
        </g>

        {/* fone de ouvido (atendente) */}
        <rect x="112" y="268" width="58" height="124" rx="26" fill="#00bf5b" />
        <rect x="630" y="268" width="58" height="124" rx="26" fill="#00bf5b" />
        <rect x="122" y="284" width="20" height="92" rx="10" fill="#7dffb4" opacity=".45" />
        <rect x="658" y="284" width="20" height="92" rx="10" fill="#7dffb4" opacity=".45" />
        <path d="M660 392 q0 82 -100 88" fill="none" stroke="#002d6b" strokeWidth="12" strokeLinecap="round" />
        <rect x="514" y="466" width="54" height="28" rx="14" fill="#002d6b" />

        {/* braços (atrás do corpo) */}
        <g style={ESTILO_BRACO(215, pose.esq)}>
          <rect x="-21" y="0" width="42" height="84" rx="21" fill="#00bf5b" />
          <circle cx="0" cy="90" r="29" fill="#00a04a" />
        </g>
        <g style={ESTILO_BRACO(585, pose.dir)}>
          <g className={pose.ola ? "mascote-ola" : atual === "comemorando" ? "mascote-festa" : ""}>
            <rect x="-21" y="0" width="42" height="84" rx="21" fill="#00bf5b" />
            <circle cx="0" cy="90" r="29" fill="#00a04a" />
          </g>
        </g>

        {/* cabeça */}
        <rect x="150" y="160" width="500" height="344" rx="112" fill={`url(#${corpo})`} />
        <ellipse cx="318" cy="190" rx="150" ry="16" transform="rotate(-7 318 190)" fill="#fff" opacity=".2" />
        <rect x="196" y="206" width="408" height="252" rx="80" fill={`url(#${tela})`} />
        <path d="M214 226 L346 226 L262 446 L214 446 Z" fill="#fff" opacity=".05" />

        {/* rosto */}
        <g style={olhos}>
          {abertos && (
            <g className="mascote-olhos">
              {olhosGrandes ? (
                <>
                  <ellipse cx="312" cy="316" rx="48" ry="56" fill="#3ee08a" /><ellipse cx="488" cy="316" rx="48" ry="56" fill="#3ee08a" />
                  <ellipse cx="312" cy="316" rx="32" ry="40" fill="#bfffd9" opacity=".6" /><ellipse cx="488" cy="316" rx="32" ry="40" fill="#bfffd9" opacity=".6" />
                  <circle cx="328" cy="296" r="15" fill="#fff" /><circle cx="504" cy="296" r="15" fill="#fff" />
                  {atual === "pedindo" && <><circle cx="294" cy="338" r="8" fill="#fff" /><circle cx="470" cy="338" r="8" fill="#fff" /></>}
                </>
              ) : (
                <>
                  <ellipse cx="312" cy="318" rx="40" ry="48" fill="#3ee08a" /><ellipse cx="488" cy="318" rx="40" ry="48" fill="#3ee08a" />
                  <ellipse cx="312" cy="322" rx="26" ry="34" fill="#bfffd9" opacity=".5" /><ellipse cx="488" cy="322" rx="26" ry="34" fill="#bfffd9" opacity=".5" />
                  <circle cx="326" cy="300" r="13" fill="#fff" /><circle cx="502" cy="300" r="13" fill="#fff" />
                </>
              )}
            </g>
          )}
        </g>
        {atual === "feliz" && (
          <>
            <path d="M270 338 q42 -60 84 0" fill="none" stroke="#3ee08a" strokeWidth="16" strokeLinecap="round" />
            <path d="M446 338 q42 -60 84 0" fill="none" stroke="#3ee08a" strokeWidth="16" strokeLinecap="round" />
          </>
        )}
        {atual === "comemorando" && (
          <>
            <polygon points={estrela(312, 318, 50, 22)} fill="#ffd84d" /><polygon points={estrela(488, 318, 50, 22)} fill="#ffd84d" />
          </>
        )}
        {atual === "dormindo" && (
          <>
            <path d="M270 322 q42 40 84 0" fill="none" stroke="#3ee08a" strokeWidth="14" strokeLinecap="round" />
            <path d="M446 322 q42 40 84 0" fill="none" stroke="#3ee08a" strokeWidth="14" strokeLinecap="round" />
          </>
        )}
        {atual === "pensando" && <path d="M448 252 q44 -24 90 -4" fill="none" stroke="#bfffd9" strokeWidth="10" strokeLinecap="round" />}
        {atual === "preocupado" && (
          <>
            <path d="M262 272 L346 242" fill="none" stroke="#bfffd9" strokeWidth="10" strokeLinecap="round" />
            <path d="M538 272 L454 242" fill="none" stroke="#bfffd9" strokeWidth="10" strokeLinecap="round" />
          </>
        )}

        {/* bochechas */}
        <ellipse cx="250" cy="388" rx={sorrisoGrande ? 28 : 22} ry={sorrisoGrande ? 15 : 12} fill="#f472b6" opacity={atual === "surpreso" ? 0.3 : 0.55} />
        <ellipse cx="550" cy="388" rx={sorrisoGrande ? 28 : 22} ry={sorrisoGrande ? 15 : 12} fill="#f472b6" opacity={atual === "surpreso" ? 0.3 : 0.55} />

        {/* boca */}
        {sorrisoGrande ? (
          <>
            <path d="M332 372 q68 90 136 0 z" fill="#04122b" stroke="#3ee08a" strokeWidth="10" strokeLinejoin="round" />
            <ellipse cx="400" cy="416" rx="28" ry="13" fill="#ff7a9c" />
          </>
        ) : atual === "surpreso" ? (
          <ellipse cx="400" cy="408" rx="22" ry="28" fill="#04122b" stroke="#3ee08a" strokeWidth="9" />
        ) : atual === "pensando" ? (
          <path d="M366 402 q34 -16 68 0" fill="none" stroke="#3ee08a" strokeWidth="12" strokeLinecap="round" />
        ) : atual === "preocupado" ? (
          <path d="M348 410 q13 -17 26 0 t26 0 t26 0 t26 0" fill="none" stroke="#3ee08a" strokeWidth="11" strokeLinecap="round" />
        ) : atual === "pedindo" ? (
          <path d="M366 394 q34 26 68 0 q-34 -10 -68 0 z" fill="#04122b" stroke="#3ee08a" strokeWidth="9" strokeLinejoin="round" />
        ) : atual === "dormindo" ? (
          <path d="M374 396 q26 16 52 0" fill="none" stroke="#3ee08a" strokeWidth="11" strokeLinecap="round" />
        ) : (
          <path d="M346 386 q54 48 108 0" fill="none" stroke="#3ee08a" strokeWidth="13" strokeLinecap="round" />
        )}

        {/* pescoço e corpo */}
        <rect x="360" y="494" width="80" height="34" fill="#00bf5b" />
        <rect x="220" y="516" width="360" height="196" rx="82" fill={`url(#${corpo})`} />
        <ellipse cx="318" cy="540" rx="84" ry="10" transform="rotate(-6 318 540)" fill="#fff" opacity=".14" />
        <rect x="290" y="552" width="220" height="112" rx="26" fill="#fff" />
        <path d="M350 586 q25 -18 50 -4 t50 -6" fill="none" stroke="#00bf5b" strokeWidth="11" strokeLinecap="round" />
        <text x="400" y="650" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="56" letterSpacing="4" fill="#002d6b">FRT</text>
        <circle className="mascote-led" cx="262" cy="640" r="9" fill="#3ee08a" />
        <circle className="mascote-led mascote-led-2" cx="538" cy="640" r="9" fill="#7dd3fc" />

        {/* detalhes por humor */}
        {atual === "dormindo" && (
          <g fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fill="#002d6b">
            <text className="mascote-zzz" x="596" y="150" fontSize="64">Z</text>
            <text className="mascote-zzz mascote-zzz-2" x="650" y="106" fontSize="48">z</text>
            <text className="mascote-zzz mascote-zzz-3" x="690" y="70" fontSize="36">z</text>
          </g>
        )}
        {atual === "preocupado" && (
          <path className="mascote-suor" d="M592 232 q-26 40 0 54 q26 -14 0 -54 z" fill="#7dd3fc" stroke="#fff" strokeWidth="4" />
        )}
        {atual === "pedindo" && (
          <g fill="#ffd84d">
            <polygon className="mascote-ponto" points={estrela(214, 232, 18, 7)} />
            <polygon className="mascote-ponto mascote-ponto-2" points={estrela(588, 226, 14, 6)} />
            <polygon className="mascote-ponto mascote-ponto-3" points={estrela(168, 330, 11, 5)} />
          </g>
        )}
        {atual === "pensando" && (
          <g fill="#002d6b">
            <circle className="mascote-ponto" cx="590" cy="130" r="12" /><circle className="mascote-ponto mascote-ponto-2" cx="632" cy="104" r="15" /><circle className="mascote-ponto mascote-ponto-3" cx="682" cy="74" r="19" />
          </g>
        )}
        {atual === "comemorando" && (
          <g>
            <polygon className="mascote-conf" points={estrela(150, 140, 26, 11)} fill="#ffd84d" />
            <polygon className="mascote-conf mascote-conf-2" points={estrela(660, 120, 22, 9)} fill="#ff7a9c" />
            <circle className="mascote-conf mascote-conf-3" cx="110" cy="260" r="12" fill="#7dd3fc" />
            <circle className="mascote-conf mascote-conf-4" cx="700" cy="250" r="12" fill="#3ee08a" />
            <rect className="mascote-conf mascote-conf-5" x="250" y="60" width="22" height="22" rx="4" fill="#ffd84d" />
            <rect className="mascote-conf mascote-conf-6" x="540" y="50" width="20" height="20" rx="4" fill="#7dd3fc" />
          </g>
        )}
      </g>
    </svg>
  )
}

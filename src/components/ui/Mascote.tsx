"use client"

import { useId } from "react"

// ─── Mascote da FRT (animado) ────────────────────────────────────────────────
// Robô nas cores da logo. Pisca, balança de leve, acena e a antena pulsa.
// As animações ficam em globals.css (classes mascote-*) e são desligadas para
// quem pede menos movimento no sistema (prefers-reduced-motion).

export default function Mascote({
  className = "h-12 w-12",
  title = "",
  animado = true,
}: Readonly<{ className?: string; title?: string; animado?: boolean }>) {
  const id = useId().replace(/:/g, "")
  const fundo = `mf${id}`
  const corpo = `mc${id}`
  const tela = `mt${id}`

  return (
    <svg
      viewBox="0 0 800 800"
      className={`${className} shrink-0 ${animado ? "mascote-anim" : ""}`}
      role={title ? "img" : "presentation"}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={fundo} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1fbf5" /><stop offset="1" stopColor="#d6f3e2" /></linearGradient>
        <linearGradient id={corpo} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b3f8a" /><stop offset="1" stopColor="#002d6b" /></linearGradient>
        <linearGradient id={tela} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#071a3a" /><stop offset="1" stopColor="#04122b" /></linearGradient>
      </defs>
      <rect width="800" height="800" rx="120" fill={`url(#${fundo})`} />
      <ellipse className="mascote-sombra" cx="400" cy="716" rx="190" ry="22" fill="#002d6b" opacity=".14" />
      <g className="mascote-pessoa">
        <rect x="392" y="96" width="16" height="70" rx="8" fill="#002d6b" />
        <g className="mascote-bola">
          <circle cx="400" cy="88" r="26" fill="#00bf5b" /><circle cx="392" cy="80" r="8" fill="#fff" opacity=".7" />
        </g>
        <rect x="118" y="270" width="52" height="120" rx="24" fill="#00bf5b" />
        <rect x="630" y="270" width="52" height="120" rx="24" fill="#00bf5b" />
        <path d="M656 390 q0 78 -96 84" fill="none" stroke="#002d6b" strokeWidth="12" strokeLinecap="round" />
        <rect x="520" y="462" width="50" height="26" rx="13" fill="#002d6b" />
        <rect x="150" y="160" width="500" height="340" rx="110" fill={`url(#${corpo})`} />
        <rect x="196" y="206" width="408" height="248" rx="78" fill={`url(#${tela})`} />
        <g className="mascote-olhos">
          <ellipse cx="312" cy="318" rx="40" ry="48" fill="#3ee08a" /><ellipse cx="488" cy="318" rx="40" ry="48" fill="#3ee08a" />
          <circle cx="326" cy="300" r="13" fill="#fff" /><circle cx="502" cy="300" r="13" fill="#fff" />
        </g>
        <ellipse cx="252" cy="384" rx="22" ry="12" fill="#f472b6" opacity=".55" /><ellipse cx="548" cy="384" rx="22" ry="12" fill="#f472b6" opacity=".55" />
        <path d="M346 386 q54 46 108 0" fill="none" stroke="#3ee08a" strokeWidth="13" strokeLinecap="round" />
        <rect x="360" y="492" width="80" height="34" fill="#00bf5b" />
        <rect x="148" y="548" width="74" height="42" rx="21" fill="#00bf5b" transform="rotate(28 185 569)" />
        <g className="mascote-braco">
          <g transform="rotate(-42 632 540)"><rect x="590" y="520" width="92" height="42" rx="21" fill="#00bf5b" /><circle cx="690" cy="541" r="30" fill="#00a04a" /></g>
        </g>
        <rect x="220" y="516" width="360" height="190" rx="80" fill={`url(#${corpo})`} />
        <rect x="290" y="552" width="220" height="108" rx="24" fill="#fff" />
        <path d="M352 584 q24 -16 48 -4 t48 -6" fill="none" stroke="#00bf5b" strokeWidth="11" strokeLinecap="round" />
        <text x="400" y="646" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="56" letterSpacing="4" fill="#002d6b">FRT</text>
        <circle cx="186" cy="592" r="30" fill="#00a04a" />
      </g>
    </svg>
  )
}

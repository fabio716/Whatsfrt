import type { ReactNode } from "react"

// ─── Busca dentro da conversa ────────────────────────────────────────────────
// Sem acento e sem maiúscula: "orcamento" acha "Orçamento". Feito letra a
// letra pra saber, no texto ORIGINAL, onde está cada achado (pro realce).
export function normalizarLetras(texto: string): { norm: string; origem: number[] } {
  let norm = ""
  const origem: number[] = []
  for (let i = 0; i < texto.length; i++) {
    const n = texto[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    for (const ch of n) { norm += ch; origem.push(i) }
  }
  return { norm, origem }
}

export function normalizarTermo(termo: string): string {
  return termo.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

// Texto com os trechos que batem com a busca marcados em amarelo.
export function TextoRealcado({ texto, termo }: Readonly<{ texto: string; termo: string }>) {
  const t = normalizarTermo(termo)
  if (!t) return <>{texto}</>
  const { norm, origem } = normalizarLetras(texto)
  const partes: ReactNode[] = []
  let ultimo = 0
  let i = norm.indexOf(t)
  while (i !== -1) {
    const ini = origem[i]
    const fim = origem[i + t.length - 1] + 1
    if (ini > ultimo) partes.push(texto.slice(ultimo, ini))
    partes.push(<mark key={ini} className="rounded bg-amber-200 px-0.5 text-inherit">{texto.slice(ini, fim)}</mark>)
    ultimo = fim
    i = norm.indexOf(t, i + t.length)
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo))
  return <>{partes}</>
}

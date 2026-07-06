// ═══════════════════════════════════════════════════════════════════════════
// Sub-menu de escolha de vendedora no fluxo Vendas da URA.
//
// Depois de digitar 1 (Vendas), o cliente ve a lista de vendedoras ativas do
// setor VENDAS e escolhe uma pelo numero. A URA atribui o contato direto pra
// vendedora escolhida — o cliente decidiu, entao pula a fila de espera.
//
// Estado "esperando escolha da vendedora" fica no Redis com TTL 15min: se o
// cliente sumir ou digitar besteira repetidamente, reseta e ele reinicia o
// menu principal.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"

const AWAITING_TTL_SECONDS = 15 * 60
const awaitingKey = (whatsappId: string): string => `ura:awaiting-vendedora:${whatsappId}`

export async function markAwaitingVendedora(whatsappId: string): Promise<void> {
  await redis.setex(awaitingKey(whatsappId), AWAITING_TTL_SECONDS, "1")
}

export async function isAwaitingVendedora(whatsappId: string): Promise<boolean> {
  const v = await redis.get(awaitingKey(whatsappId))
  return v === "1"
}

export async function clearAwaitingVendedora(whatsappId: string): Promise<void> {
  await redis.del(awaitingKey(whatsappId))
}

export interface Vendedora {
  id: string
  name: string
}

// Vendedoras ativas do setor VENDAS, em ordem alfabetica. Base dinamica —
// admin adiciona/remove em /admin/users e o menu reflete na proxima msg.
export async function getVendedoras(): Promise<Vendedora[]> {
  return prisma.user.findMany({
    where: { role: "AGENT", isActive: true, department: "VENDAS" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
}

// Monta o texto do sub-menu com base na lista atual de vendedoras.
export function buildVendedorasMenu(vendedoras: Vendedora[]): string {
  const linhas = vendedoras
    .map((v, i) => `${i + 1}️⃣  ${v.name}`)
    .join("\n")
  return (
    "👥 Perfeito! Com qual vendedora você quer falar?\n\n" +
    linhas +
    "\n\nResponda com o número da opção."
  )
}

// Traduz o digito escolhido pelo cliente na vendedora correspondente.
// Retorna null se fora do range (ex: cliente digita "9" mas so tem 4).
export function pickVendedoraByDigit(
  vendedoras: Vendedora[],
  digit: string,
): Vendedora | null {
  const n = Number.parseInt(digit.trim(), 10)
  if (!Number.isFinite(n) || n < 1 || n > vendedoras.length) return null
  return vendedoras[n - 1] ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// Retoma campanhas de transmissão que pararam sozinhas por atingir o
// rate-limit (30/hora ou 200/dia — ver campaignQueue.ts). Sem isso, uma
// transmissão maior que o limite por hora ficava parada em "Na fila" pra
// sempre, sem ninguém pra retomar — é exatamente o tipo de coisa que fazia a
// equipe achar que o sistema "travava".
//
// NÃO retoma campanha PAUSADA ou CANCELADA manualmente — só quem tem
// pausedAt setado automaticamente pelo rate-limit (status PENDING).
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { processCampaign } from "@/lib/campaignQueue"

const CHECK_INTERVAL_MS = 5 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

async function resumeStalled(): Promise<void> {
  try {
    const stalled = await prisma.campaign.findMany({
      where: { status: "PENDING", pausedAt: { not: null } },
      select: { id: true, name: true },
    })
    if (stalled.length === 0) return

    console.log(`[campaign-resumer] retomando ${stalled.length} campanha(s) pausada(s) por rate-limit`)
    for (const c of stalled) {
      processCampaign(c.id).catch((e: unknown) => console.error(`[campaign-resumer] falha ao retomar ${c.id}:`, e))
    }
  } catch (err) {
    console.error("[campaign-resumer] tick error:", err)
  }
}

export function startCampaignResumer(): void {
  if (timer) return
  setTimeout(() => void resumeStalled(), 60_000)
  timer = setInterval(() => void resumeStalled(), CHECK_INTERVAL_MS)
  console.log("[campaign-resumer] iniciado (a cada 5 min)")
}

export function stopCampaignResumer(): void {
  if (timer) clearInterval(timer)
  timer = null
}

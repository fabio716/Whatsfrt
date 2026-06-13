import { prisma } from "@/lib/prisma"
import { sendCampaignMessage } from "@/lib/evolution"

// ═══════════════════════════════════════════════════════════════════════════
// Campaign Queue com Proteções Avançadas
// ═══════════════════════════════════════════════════════════════════════════

interface CampaignStats {
  sent: number
  failed: number
  blocked: number
  total: number
  errorRate: number
  deliveryRate: number
}

function humanDelay(minSec: number, maxSec: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxSec - minSec) * 1000) + minSec * 1000
  return new Promise((r) => setTimeout(r, ms))
}

async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const logs = await prisma.campaignLog.findMany({
    where: { campaignId },
    select: { status: true, sentAt: true, blockedByContact: true },
  })

  const total = logs.length
  // A message counts as "sent" once it left the system, even if it later
  // transitioned to DELIVERED/READ via receipts.
  const sent = logs.filter((l) => l.sentAt !== null).length
  const failed = logs.filter((l) => l.status === "FAILED").length
  const blocked = logs.filter((l) => l.blockedByContact).length

  return {
    sent,
    failed,
    blocked,
    total,
    errorRate: total > 0 ? (failed / total) * 100 : 0,
    deliveryRate: total > 0 ? (sent / total) * 100 : 0,
  }
}

async function shouldPauseCampaign(campaignId: string, stats: CampaignStats): Promise<boolean> {
  // Pausa se taxa de erro > 20%
  if (stats.errorRate > 20) {
    console.warn(`[Campaign ${campaignId}] Taxa de erro alta: ${stats.errorRate.toFixed(1)}%`)
    return true
  }

  // Pausa se taxa de bloqueio > 5%
  const blockRate = stats.total > 0 ? (stats.blocked / stats.total) * 100 : 0
  if (blockRate > 5) {
    console.warn(`[Campaign ${campaignId}] Taxa de bloqueio alta: ${blockRate.toFixed(1)}%`)
    return true
  }

  return false
}

async function checkRateLimits(campaignId: string): Promise<boolean> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { maxPerDay: true, maxPerHour: true, createdAt: true },
  })

  if (!campaign) return false

  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const sentLastHour = await prisma.campaignLog.count({
    where: {
      campaignId,
      sentAt: { gte: hourAgo },
    },
  })

  const sentLastDay = await prisma.campaignLog.count({
    where: {
      campaignId,
      sentAt: { gte: dayAgo },
    },
  })

  if (sentLastHour >= campaign.maxPerHour) {
    console.warn(`[Campaign ${campaignId}] Limite por hora atingido: ${sentLastHour}/${campaign.maxPerHour}`)
    return false
  }

  if (sentLastDay >= campaign.maxPerDay) {
    console.warn(`[Campaign ${campaignId}] Limite por dia atingido: ${sentLastDay}/${campaign.maxPerDay}`)
    return false
  }

  return true
}

export async function processCampaign(campaignId: string): Promise<void> {
  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "PROCESSING", pausedAt: null },
    })

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { messageText: true, mediaUrl: true, mediaType: true, delayMin: true, delayMax: true },
    })

    if (!campaign) return

    const logs = await prisma.campaignLog.findMany({
      where: { campaignId, status: "PENDING" },
      include: { contact: { select: { id: true, whatsappId: true, name: true } } },
    })

    console.log(`[Campaign ${campaignId}] Processando ${logs.length} mensagens`)

    for (const log of logs) {
      // Verifica limites de rate
      const canSend = await checkRateLimits(campaignId)
      if (!canSend) {
        console.log(`[Campaign ${campaignId}] Rate limit atingido. Pausando...`)
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: "PENDING", pausedAt: new Date() },
        })
        return
      }

      // Verifica saúde da campanha
      const stats = await getCampaignStats(campaignId)
      const shouldPause = await shouldPauseCampaign(campaignId, stats)
      if (shouldPause) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: "FAILED",
            pausedAt: new Date(),
            errorCount: stats.failed,
            deliveryRate: stats.deliveryRate,
          },
        })
        console.error(`[Campaign ${campaignId}] Campanha pausada por segurança`)
        return
      }

      // Personaliza mensagem com nome do contato
      const personalizedMessage = campaign.messageText.replace(/\{nome\}/gi, log.contact.name)

      try {
        const { ok, messageId } = await sendCampaignMessage(log.contact.whatsappId, {
          text: personalizedMessage,
          mediaUrl: campaign.mediaUrl,
          mediaType: campaign.mediaType,
        })
        await prisma.campaignLog.update({
          where: { id: log.id },
          data: {
            status: ok ? "SENT" : "FAILED",
            sentAt: ok ? new Date() : null,
            messageKeyId: messageId,
            errorMsg: ok ? null : "Evolution API retornou falha",
          },
        })

        if (ok) {
          console.log(`[Campaign ${campaignId}] ✓ Enviado para ${log.contact.name}`)
        } else {
          console.warn(`[Campaign ${campaignId}] ✗ Falha ao enviar para ${log.contact.name}`)
        }
      } catch (err) {
        await prisma.campaignLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            errorMsg: err instanceof Error ? err.message : "Erro desconhecido",
          },
        })
        console.error(`[Campaign ${campaignId}] Erro ao enviar para ${log.contact.name}:`, err)
      }

      // Delay humanizado configurável
      await humanDelay(campaign.delayMin, campaign.delayMax)
    }

    // Atualiza estatísticas finais
    const finalStats = await getCampaignStats(campaignId)
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "COMPLETED",
        errorCount: finalStats.failed,
        deliveryRate: finalStats.deliveryRate,
      },
    })

    console.log(`[Campaign ${campaignId}] ✓ Concluída - ${finalStats.sent}/${finalStats.total} enviadas`)
  } catch (err) {
    await prisma.campaign
      .update({ where: { id: campaignId }, data: { status: "FAILED" } })
      .catch(() => null)
    console.error("[campaignQueue] fatal error:", err)
  }
}

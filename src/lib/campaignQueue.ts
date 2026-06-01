import { prisma } from "@/lib/prisma"
import { sendEvolutionText } from "@/lib/evolution"

function humanDelay(): Promise<void> {
  const ms = Math.floor(Math.random() * 7_000) + 5_000
  return new Promise((r) => setTimeout(r, ms))
}

export async function processCampaign(campaignId: string): Promise<void> {
  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "PROCESSING" },
    })

    const logs = await prisma.campaignLog.findMany({
      where: { campaignId, status: "PENDING" },
      include: { contact: { select: { id: true, whatsappId: true } } },
    })

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { messageText: true },
    })

    if (!campaign) return

    for (const log of logs) {
      try {
        const ok = await sendEvolutionText(log.contact.whatsappId, campaign.messageText)
        await prisma.campaignLog.update({
          where: { id: log.id },
          data: {
            status: ok ? "SENT" : "FAILED",
            sentAt: ok ? new Date() : null,
            errorMsg: ok ? null : "Evolution API retornou falha",
          },
        })
      } catch (err) {
        await prisma.campaignLog.update({
          where: { id: log.id },
          data: {
            status: "FAILED",
            errorMsg: err instanceof Error ? err.message : "Erro desconhecido",
          },
        })
      }

      await humanDelay()
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "COMPLETED" },
    })
  } catch (err) {
    await prisma.campaign
      .update({ where: { id: campaignId }, data: { status: "FAILED" } })
      .catch(() => null)
    console.error("[campaignQueue] fatal error:", err)
  }
}

import { prisma } from "@/lib/prisma"
import { BusinessHoursValidator } from "../businessHours"
import type { UraSessionData, UraTransition } from "../types"

// ═══════════════════════════════════════════════════════════════════════════
// Fluxo Noturno (Fora do Expediente - Captura de Leads)
// ═══════════════════════════════════════════════════════════════════════════

export async function handleNightFlow(
  session: UraSessionData,
  input: string
): Promise<UraTransition> {
  const node = session.currentNode

  switch (node) {
    case "night_greeting": {
      const businessHours = await BusinessHoursValidator.check()
      const nextOpen = businessHours.nextOpenTime
      const timeStr = BusinessHoursValidator.formatNextOpenTime(nextOpen)
      
      const message = await getConfigMessage("outOfOfficeMessage") +
        `\n\nRetornaremos ${timeStr}.` +
        `\n\nPor favor, informe seu nome:`

      return {
        nextNode: "night_ask_name",
        message,
      }
    }

    case "night_ask_name": {
      return {
        nextNode: "night_ask_sector",
        message: await getConfigMessage("nightAskSectorMessage"),
        updateData: { collectedName: input.trim() },
      }
    }

    case "night_ask_sector": {
      const sectorMap: Record<string, "FINANCEIRO" | "SUPORTE" | "VENDAS"> = {
        "1": "FINANCEIRO",
        "2": "SUPORTE",
        "3": "VENDAS",
      }

      const sector = sectorMap[input.trim()]
      if (!sector) {
        return {
          nextNode: "night_ask_sector",
          message: "Opção inválida. Escolha:\n1️⃣ Financeiro\n2️⃣ Suporte\n3️⃣ Vendas",
        }
      }

      return {
        nextNode: "night_ask_subject",
        message: await getConfigMessage("nightAskSubjectMessage"),
        updateData: { collectedSector: sector },
      }
    }

    case "night_ask_subject": {
      // Verifica se tem oferta noturna ativa para vendas
      const hasOffer = session.collectedSector === "VENDAS"
      const config = await prisma.uraConfig.findFirst({
        where: { isActive: true },
        include: { nightOffer: true },
      })

      const offerActive = config?.nightOffer?.isActive && hasOffer

      return {
        nextNode: offerActive ? "night_offer" : "night_finish",
        message: offerActive ? "" : "Obrigado! Sua mensagem foi registrada e retornaremos em breve.",
        updateData: { collectedSubject: input.trim() },
        shouldFinish: !offerActive,
        assignTo: { department: session.collectedSector },
      }
    }

    case "night_offer": {
      const config = await prisma.uraConfig.findFirst({
        where: { isActive: true },
        include: { nightOffer: true },
      })

      if (!config?.nightOffer) {
        return {
          nextNode: "night_finish",
          message: "Obrigado! Retornaremos em breve.",
          shouldFinish: true,
        }
      }

      const offer = config.nightOffer
      const discountStr = offer.discountType === "percentage"
        ? `${offer.discountValue}%`
        : `R$ ${offer.discountValue.toFixed(2)}`

      const message = offer.offerMessage
        .replace("{coupon}", offer.couponCode)
        .replace("{discount}", discountStr)
        .replace("{url}", offer.storeUrl)

      return {
        nextNode: "night_finish",
        message: message + "\n\nObrigado! Retornaremos em breve.",
        shouldFinish: true,
        assignTo: { department: "VENDAS" },
      }
    }

    case "night_finish": {
      return {
        nextNode: "night_finish",
        message: "Obrigado! Sua mensagem foi registrada.",
        shouldFinish: true,
      }
    }

    default:
      return {
        nextNode: "night_greeting",
        message: "Desculpe, ocorreu um erro. Vamos recomeçar.",
      }
  }
}

async function getConfigMessage(field: string): Promise<string> {
  const config = await prisma.uraConfig.findFirst({
    where: { isActive: true },
  })
  return (config as any)?.[field] || ""
}

import { prisma } from "@/lib/prisma"
import type { UraSessionData, UraTransition } from "../types"

// ═══════════════════════════════════════════════════════════════════════════
// Fluxo Comercial (Horário de Expediente)
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCommercialFlow(
  session: UraSessionData,
  input: string
): Promise<UraTransition> {
  const node = session.currentNode

  switch (node) {
    case "greeting":
      return {
        nextNode: "ask_name",
        message: await getConfigMessage("askNameMessage"),
      }

    case "ask_name":
      return {
        nextNode: "ask_profile",
        message: await getConfigMessage("askProfileMessage"),
        updateData: { collectedName: input.trim() },
      }

    case "ask_profile":
      const profile = input.trim() === "1" ? "PF" : input.trim() === "2" ? "PJ" : null
      if (!profile) {
        return {
          nextNode: "ask_profile",
          message: "Opção inválida. Por favor, escolha:\n1️⃣ Pessoa Física\n2️⃣ Pessoa Jurídica",
        }
      }
      return {
        nextNode: "ask_sector",
        message: await getConfigMessage("askSectorMessage"),
        updateData: { collectedProfile: profile },
      }

    case "ask_sector":
      if (input.trim() === "1") {
        // Financeiro
        return {
          nextNode: "assign_to_queue",
          message: "Você será atendido pelo setor Financeiro. Aguarde um momento.",
          assignTo: { department: "FINANCEIRO" },
          shouldFinish: true,
        }
      } else if (input.trim() === "2") {
        // Suporte
        return {
          nextNode: "ask_support_type",
          message: "Qual tipo de suporte?\n1️⃣ Secretaria/Assistência\n2️⃣ Suporte Técnico\n0️⃣ Voltar",
        }
      } else if (input.trim() === "3") {
        // Vendas
        return {
          nextNode: "ask_sales_type",
          message: "Qual tipo de atendimento?\n1️⃣ B2B (Cooperativas)\n2️⃣ Varejo/Revenda\n0️⃣ Voltar",
        }
      } else {
        return {
          nextNode: "ask_sector",
          message: "Opção inválida. Escolha:\n1️⃣ Financeiro\n2️⃣ Suporte\n3️⃣ Vendas\n0️⃣ Voltar",
        }
      }

    case "ask_support_type":
      if (input.trim() === "1") {
        // Secretaria - busca secretária ativa
        const secretary = await prisma.user.findFirst({
          where: {
            department: "ATENDIMENTO",
            isActive: true,
          },
        })
        return {
          nextNode: "assign_to_agent",
          message: "Conectando você com a secretaria...",
          assignTo: { userId: secretary?.id, department: "ATENDIMENTO" },
          shouldFinish: true,
        }
      } else if (input.trim() === "2") {
        // Suporte Técnico
        return {
          nextNode: "assign_to_queue",
          message: "Você será atendido pelo Suporte Técnico. Aguarde um momento.",
          assignTo: { department: "SUPORTE" },
          shouldFinish: true,
        }
      } else {
        return {
          nextNode: "ask_support_type",
          message: "Opção inválida. Escolha:\n1️⃣ Secretaria\n2️⃣ Técnico\n0️⃣ Voltar",
        }
      }

    case "ask_sales_type":
      if (input.trim() === "1") {
        // B2B - Lista cooperativas
        const cooperatives = await prisma.cooperative.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
        })

        if (cooperatives.length === 0) {
          return {
            nextNode: "assign_to_queue",
            message: "No momento não temos cooperativas cadastradas. Você será atendido por um consultor.",
            assignTo: { department: "VENDAS" },
            shouldFinish: true,
          }
        }

        const message = "Qual cooperativa?\n" +
          cooperatives.map((c, i) => `${i + 1}️⃣ ${c.name}`).join("\n") +
          "\n0️⃣ Voltar"

        return {
          nextNode: "ask_cooperative",
          message,
        }
      } else if (input.trim() === "2") {
        // Varejo
        return {
          nextNode: "ask_uf",
          message: "Por favor, informe a UF (estado) onde você está:\nExemplo: SP, RJ, MG, etc.",
        }
      } else {
        return {
          nextNode: "ask_sales_type",
          message: "Opção inválida. Escolha:\n1️⃣ B2B\n2️⃣ Varejo\n0️⃣ Voltar",
        }
      }

    case "ask_cooperative":
      const coopIndex = parseInt(input.trim()) - 1
      const cooperatives = await prisma.cooperative.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: { assignedUser: true },
      })

      if (coopIndex < 0 || coopIndex >= cooperatives.length) {
        return {
          nextNode: "ask_cooperative",
          message: "Opção inválida. Escolha um número da lista ou 0 para voltar.",
        }
      }

      const selectedCoop = cooperatives[coopIndex]
      return {
        nextNode: "assign_to_agent",
        message: `Conectando você com o consultor de ${selectedCoop.name}...`,
        assignTo: { userId: selectedCoop.assignedUserId || undefined, department: "VENDAS" },
        updateData: { collectedCooperative: selectedCoop.name },
        shouldFinish: true,
      }

    case "ask_uf":
      const uf = input.trim().toUpperCase()
      
      // Valida UF
      const validUFs = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"]
      if (!validUFs.includes(uf)) {
        return {
          nextNode: "ask_uf",
          message: "UF inválida. Por favor, informe uma UF válida (ex: SP, RJ, MG).",
        }
      }

      // Busca território
      const territory = await prisma.territory.findUnique({
        where: { uf },
      })

      if (!territory || territory.assignedUserIds.length === 0) {
        return {
          nextNode: "assign_to_queue",
          message: `No momento não temos vendedor disponível para ${uf}. Você será atendido por um consultor geral.`,
          assignTo: { department: "VENDAS" },
          shouldFinish: true,
        }
      }

      // Round Robin simples (pega primeiro da lista)
      const userId = territory.assignedUserIds[0]

      return {
        nextNode: "assign_to_agent",
        message: `Conectando você com o vendedor de ${uf}...`,
        assignTo: { userId, department: "VENDAS" },
        updateData: { collectedUF: uf },
        shouldFinish: true,
      }

    default:
      return {
        nextNode: "greeting",
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

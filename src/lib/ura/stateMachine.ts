import { prisma } from "@/lib/prisma"
import { sendEvolutionText } from "@/lib/evolution"
import { UraSessionManager } from "./session"
import { BusinessHoursValidator } from "./businessHours"
import type { UraSessionData, UraTransition, UraNodeType } from "./types"

// ═══════════════════════════════════════════════════════════════════════════
// State Machine Engine - Motor da URA
// ═══════════════════════════════════════════════════════════════════════════

export class UraStateMachine {
  /**
   * Processa mensagem recebida e executa transição de estado
   */
  static async processMessage(
    whatsappId: string,
    messageText: string,
    contactName?: string
  ): Promise<void> {
    try {
      // Verifica se contato tem atendente atribuído
      const contact = await prisma.contact.findUnique({
        where: { whatsappId },
        include: { assignedUser: true },
      })

      // Se tem atendente ativo, não entra na URA
      if (contact?.assignedUser && contact.chatStatus === "IN_SERVICE") {
        console.log(`[URA] Contact ${whatsappId} has active agent. Skipping URA.`)
        return
      }

      // Busca ou cria sessão
      let session = await UraSessionManager.get(whatsappId)

      // Se não tem sessão, inicia nova
      if (!session) {
        const businessHours = await BusinessHoursValidator.check()
        const isNightFlow = !businessHours.isOpen

        session = await UraSessionManager.createOrUpdate(whatsappId, {
          currentNode: isNightFlow ? "night_greeting" : "greeting",
          isNightFlow,
        })

        // Atualiza status do contato
        await prisma.contact.upsert({
          where: { whatsappId },
          create: {
            whatsappId,
            name: contactName || "Contato",
            chatStatus: "IN_URA",
          },
          update: {
            chatStatus: "IN_URA",
          },
        })
      }

      // Trata navegação "0 - Voltar"
      if (messageText.trim() === "0" && session.previousNode) {
        session = await UraSessionManager.goBack(whatsappId) || session
        const message = await this.getNodeMessage(session.currentNode, session)
        await sendEvolutionText(whatsappId, message)
        return
      }

      // Executa transição de estado
      const transition = await this.executeNode(session, messageText)

      // Atualiza sessão
      await UraSessionManager.createOrUpdate(whatsappId, {
        previousNode: session.currentNode,
        currentNode: transition.nextNode,
        ...transition.updateData,
      })

      // Envia mensagem de resposta
      if (transition.message) {
        await sendEvolutionText(whatsappId, transition.message)
      }

      // Se deve atribuir a agente/fila
      if (transition.assignTo) {
        await this.assignContact(whatsappId, transition.assignTo)
      }

      // Se finalizou, limpa sessão
      if (transition.shouldFinish) {
        await UraSessionManager.delete(whatsappId)
      }
    } catch (err) {
      console.error("[URA] Error processing message:", err)
      // Em caso de erro, envia mensagem genérica
      await sendEvolutionText(
        whatsappId,
        "Desculpe, ocorreu um erro. Por favor, tente novamente ou aguarde contato de um atendente."
      )
    }
  }

  /**
   * Executa lógica do nó atual
   */
  private static async executeNode(
    session: UraSessionData,
    input: string
  ): Promise<UraTransition> {
    const node = session.currentNode

    // Importa handlers dinâmicos
    const { handleCommercialFlow } = await import("./nodes/commercial")
    const { handleNightFlow } = await import("./nodes/night")

    if (session.isNightFlow) {
      return handleNightFlow(session, input)
    } else {
      return handleCommercialFlow(session, input)
    }
  }

  /**
   * Busca mensagem do nó
   */
  private static async getNodeMessage(
    node: UraNodeType,
    session: UraSessionData
  ): Promise<string> {
    const config = await prisma.uraConfig.findFirst({
      where: { isActive: true },
    })

    if (!config) return "Olá! Como podemos ajudar?"

    const messages: Record<UraNodeType, string> = {
      greeting: config.greetingText,
      ask_name: config.askNameMessage,
      ask_profile: config.askProfileMessage,
      ask_sector: config.askSectorMessage,
      night_greeting: config.outOfOfficeMessage,
      night_ask_name: config.nightAskNameMessage,
      night_ask_sector: config.nightAskSectorMessage,
      night_ask_subject: config.nightAskSubjectMessage,
      // Outros nós retornam mensagens dinâmicas
      ask_support_type: "Qual tipo de suporte?\n1️⃣ Secretaria\n2️⃣ Técnico\n0️⃣ Voltar",
      ask_sales_type: "Qual tipo de venda?\n1️⃣ B2B (Cooperativas)\n2️⃣ Varejo\n0️⃣ Voltar",
      ask_cooperative: "", // Gerado dinamicamente
      ask_uf: "Por favor, informe a UF (estado) onde você está:",
      night_offer: "", // Gerado dinamicamente
      night_finish: "Obrigado! Retornaremos em breve.",
      assign_to_agent: "",
      assign_to_queue: "",
      finish: "",
    }

    return messages[node] || ""
  }

  /**
   * Atribui contato a agente ou fila
   */
  private static async assignContact(
    whatsappId: string,
    assignment: { userId?: string; department?: string }
  ): Promise<void> {
    await prisma.contact.update({
      where: { whatsappId },
      data: {
        assignedUserId: assignment.userId || null,
        chatStatus: assignment.userId ? "IN_SERVICE" : "WAITING_AGENT",
      },
    })

    const message = assignment.userId
      ? "Você foi conectado a um atendente. Aguarde um momento."
      : "Você foi adicionado à fila de atendimento. Em breve um atendente irá te atender."

    await sendEvolutionText(whatsappId, message)
  }
}

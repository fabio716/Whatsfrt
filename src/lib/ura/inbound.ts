// ═══════════════════════════════════════════════════════════════════════════
// URA inbound handler. Antes vivia inline em /api/webhooks/evolution; agora
// é chamado pelo worker da fila para que o webhook responda em ms e a URA
// rode em background (sobrevivendo a restart).
//
// Comportamento idêntico ao da versão anterior — só a forma de execução muda
// (queue worker em vez de await inline).
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { ChatStatus, MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { sendText as sendWhatsAppText } from "@/lib/whatsapp"
import { getUraConfigCached } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"
import { markWaitingForAgent, pickAgentForDepartment, assignAgent } from "@/lib/serviceTracking"
import { markAwaitingUf, isAwaitingUf, clearAwaitingUf, parseUf, pickAgentForUf } from "@/lib/ura/salesFlow"

const ASK_UF_MESSAGE =
  "🗺️ Perfeito! Para te encaminhar pra vendedora que atende sua região, " +
  "me conta: *qual é o seu estado?*\n\n" +
  "Você pode responder com a sigla (ex: *SP*, *RJ*, *PR*) ou o nome completo."

async function routeToAgent(
  contact: ContactSnapshot,
  agentId: string,
  successMsg: string,
): Promise<void> {
  await assignAgent(contact.id, agentId)
  await sendUraMessage(contact, successMsg)
  broadcast({
    type: "new_message",
    data: {
      id: `ura-route-${contact.id}-${Date.now()}`,
      body: "[URA] Contato roteado pra você",
      direction: MessageDirection.INBOUND,
      status: MessageStatus.DELIVERED,
      createdAt: new Date().toISOString(),
      agentId: null,
      contactId: contact.id,
      contact: { ...contact, assignedUserId: agentId, chatStatus: ChatStatus.IN_SERVICE },
    },
  }, agentId)
}

interface ContactSnapshot {
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: ChatStatus
  assignedUserId: string | null
}

async function sendUraMessage(contact: ContactSnapshot, text: string): Promise<void> {
  // Usa dispatcher (Z-API ou Evolution conforme env) e captura messageId
  // para que ticks ✓/✓✓/✓✓ azul funcionem nas mensagens da URA também.
  const result = await sendWhatsAppText(contact.whatsappId, text)
  const saved = await prisma.message.create({
    data: {
      body: text,
      direction: MessageDirection.OUTBOUND,
      status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
      contactId: contact.id,
      ...(result.messageId ? { whatsappKeyId: result.messageId } : {}),
    },
  })
  broadcast({
    type: "new_message",
    data: {
      id: saved.id, body: saved.body, direction: saved.direction,
      status: saved.status, createdAt: saved.createdAt.toISOString(),
      agentId: null, contactId: contact.id, contact,
    },
  })
}

export async function handleInboundForUra(
  whatsappId: string,
  inboundText: string,
): Promise<void> {
  // Pega o estado atual do contato — pode ter mudado desde o webhook (agente
  // assumiu, etc). Sempre buscar fresco antes de mexer.
  const contact = await prisma.contact.findUnique({
    where: { whatsappId },
    select: {
      id: true, whatsappId: true, name: true, profilePhotoUrl: true,
      chatStatus: true, assignedUserId: true,
    },
  })
  if (!contact) return

  // Tem agente? URA não faz nada.
  if (contact.assignedUserId !== null) return

  if (contact.whatsappId.endsWith("@g.us")) return
  const digits = contact.whatsappId.replace("@s.whatsapp.net", "")
  if (digits.length > 13) return

  // Mensagem só de mídia (áudio/foto/vídeo/doc sem caption) NÃO dispara URA.
  // Quem manda áudio quer falar com humano, não escolher menu. Manda direto
  // pra fila de WAITING_AGENT pra um agente assumir e ouvir.
  if (!inboundText.trim()) {
    if (contact.chatStatus === ChatStatus.IDLE || contact.chatStatus === ChatStatus.IN_URA) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: {
          chatStatus: ChatStatus.WAITING_AGENT,
          waitingAgentSince: new Date(),
        },
      })
    }
    return
  }

  const cfg = await getUraConfigCached()
  if (!cfg.isActive) return

  // digit → opção completa (label + targetDepartment) pra rotear ao setor certo.
  const optionMap = Object.fromEntries(cfg.options.map((o) => [o.digit, o]))

  if (contact.chatStatus === ChatStatus.IDLE) {
    const bizStatus = isBusinessHour(cfg)

    if (bizStatus === "CLOSED") {
      if (cfg.outOfOfficeMessage) await sendUraMessage(contact, cfg.outOfOfficeMessage)
      return
    }
    if (bizStatus === "LUNCH") {
      if (cfg.lunchMessage) await sendUraMessage(contact, cfg.lunchMessage)
      return
    }

    await prisma.contact.update({ where: { id: contact.id }, data: { chatStatus: ChatStatus.IN_URA } })
    await sendUraMessage(contact, cfg.greetingText)
    return
  }

  if (contact.chatStatus === ChatStatus.IN_URA) {
    // ─── Sub-fluxo Vendas: aguardando UF do cliente ─────────────────────────
    // Setado quando ele acabou de escolher Vendas no menu. Proxima msg dele
    // deve ser o estado (sigla ou nome). Rota vai pra vendedora do Territory
    // correspondente; se nao rolar (UF invalida ou sem cobertura), cai no
    // fallback do departamento VENDAS.
    if (await isAwaitingUf(contact.whatsappId)) {
      const uf = parseUf(inboundText)
      if (!uf) {
        await sendUraMessage(
          contact,
          "⚠️ Não consegui identificar seu estado.\n\n" +
          "Responde só com a sigla (ex: *SP*, *RJ*, *PR*, *RS*) ou digita o nome completo.",
        )
        return
      }

      await markWaitingForAgent(contact.id)
      await clearAwaitingUf(contact.whatsappId)

      const territoryAgent = await pickAgentForUf(uf)
      if (territoryAgent) {
        await routeToAgent(
          contact,
          territoryAgent,
          `✅ Estado *${uf}* confirmado.\nA vendedora que atende sua região já vai te responder. 🙏`,
        )
        return
      }

      // Territorio sem cobertura — cai no rateio geral de VENDAS.
      const fallbackAgent = await pickAgentForDepartment("VENDAS")
      if (fallbackAgent) {
        await routeToAgent(
          contact,
          fallbackAgent,
          `✅ Estado *${uf}* recebido.\nUm de nossos vendedores já vai te responder. 🙏`,
        )
      } else {
        await sendUraMessage(
          contact,
          `✅ Estado *${uf}* recebido.\nUm agente irá te atender em breve. Aguarde! 🙏`,
        )
      }
      return
    }

    const option = inboundText.trim()
    const chosen = optionMap[option]
    if (chosen) {
      // Vendas tem passo extra: perguntar UF antes de rotear, pra escolher a
      // vendedora do Territory certo. Outros setores vao direto pro rateio.
      if (chosen.targetDepartment === "VENDAS") {
        await markAwaitingUf(contact.whatsappId)
        await sendUraMessage(contact, ASK_UF_MESSAGE)
        return
      }

      // 1 — Marca tempo de espera (base do cronômetro em Equipe ao vivo).
      await markWaitingForAgent(contact.id)

      // 2 — Tenta auto-atribuir ao agente do setor escolhido. Sem isso o
      // contato fica WAITING_AGENT sem dono, e como o painel filtra por
      // assignedUserId pro AGENT, ninguém do setor vê e só o admin enxerga.
      const agentId = await pickAgentForDepartment(chosen.targetDepartment)
      if (agentId) {
        await routeToAgent(
          contact,
          agentId,
          `✅ Você selecionou *${chosen.label}*.\nUm de nossos atendentes já vai te responder. 🙏`,
        )
      } else {
        // Sem agente disponível no setor — mantém WAITING_AGENT pro admin assumir.
        await sendUraMessage(
          contact,
          `✅ Você selecionou *${chosen.label}*.\nUm agente irá te atender em breve. Aguarde! 🙏`,
        )
      }
    } else {
      await sendUraMessage(contact, `⚠️ Opção inválida. Por favor, escolha:\n\n${cfg.greetingText}`)
    }
  }
  // WAITING_AGENT / IN_SERVICE: nada a fazer.
}

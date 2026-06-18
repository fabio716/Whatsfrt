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
import { sendEvolutionText } from "@/lib/evolution"
import { getUraConfigCached } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"
import { markWaitingForAgent } from "@/lib/serviceTracking"

interface ContactSnapshot {
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: ChatStatus
  assignedUserId: string | null
}

async function sendUraMessage(contact: ContactSnapshot, text: string): Promise<void> {
  const ok = await sendEvolutionText(contact.whatsappId, text)
  const saved = await prisma.message.create({
    data: {
      body: text,
      direction: MessageDirection.OUTBOUND,
      status: ok ? MessageStatus.SENT : MessageStatus.FAILED,
      contactId: contact.id,
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

  const optionMap = Object.fromEntries(cfg.options.map((o) => [o.digit, o.label]))

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
    const option = inboundText.trim()
    const label = optionMap[option]
    if (label) {
      // Marca o instante em que entrou em fila — base para "tempo de espera"
      // na tela Equipe ao vivo.
      await markWaitingForAgent(contact.id)
      await sendUraMessage(
        contact,
        `✅ Você selecionou *${label}*.\nUm agente irá te atender em breve. Aguarde! 🙏`,
      )
    } else {
      await sendUraMessage(contact, `⚠️ Opção inválida. Por favor, escolha:\n\n${cfg.greetingText}`)
    }
  }
  // WAITING_AGENT / IN_SERVICE: nada a fazer.
}

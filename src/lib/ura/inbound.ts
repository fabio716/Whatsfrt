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
import { markWaitingForAgent, assignAgent } from "@/lib/serviceTracking"
import {
  markAwaitingVendedora,
  isAwaitingVendedora,
  clearAwaitingVendedora,
  getVendedoras,
  buildVendedorasMenu,
  pickVendedoraByDigit,
} from "@/lib/ura/vendedoraFlow"

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
    // ─── Sub-fluxo Vendas: aguardando escolha da vendedora ────────────────
    // Setado logo apos o cliente escolher "1 Vendas" no menu principal.
    // Proxima msg dele deve ser o numero da vendedora. Se acertar, atribui
    // direto pra ela (cliente escolheu explicitamente — pula fila). Se
    // errar, mostra o menu de novo.
    if (await isAwaitingVendedora(contact.whatsappId)) {
      const vendedoras = await getVendedoras()
      if (vendedoras.length === 0) {
        // Nenhuma vendedora ativa agora — cai na fila padrao de VENDAS.
        await clearAwaitingVendedora(contact.whatsappId)
        await markWaitingForAgent(contact.id, "VENDAS")
        await sendUraMessage(
          contact,
          "✅ Recebido!\nUm de nossos atendentes já vai te responder. 🙏",
        )
        return
      }
      const picked = pickVendedoraByDigit(vendedoras, inboundText)
      if (!picked) {
        await sendUraMessage(
          contact,
          "⚠️ Não entendi. Por favor, escolha o número da vendedora:\n\n" +
          buildVendedorasMenu(vendedoras),
        )
        return
      }
      await clearAwaitingVendedora(contact.whatsappId)
      await assignAgent(contact.id, picked.id)
      await sendUraMessage(
        contact,
        `✅ Você escolheu *${picked.name}*.\nEla já vai te responder. 🙏`,
      )
      // Notifica a vendedora escolhida via SSE (chat abre em tempo real).
      broadcast({
        type: "new_message",
        data: {
          id: `ura-route-${contact.id}-${Date.now()}`,
          body: "[URA] Cliente te escolheu no menu",
          direction: MessageDirection.INBOUND,
          status: MessageStatus.DELIVERED,
          createdAt: new Date().toISOString(),
          agentId: null,
          contactId: contact.id,
          contact: { ...contact, assignedUserId: picked.id, chatStatus: ChatStatus.IN_SERVICE },
        },
      }, picked.id)
      return
    }

    const option = inboundText.trim()
    const chosen = optionMap[option]
    if (chosen) {
      // Vendas tem sub-menu: cliente escolhe qual vendedora quer falar. As
      // demais opcoes vao direto pra Fila de espera do setor.
      if (chosen.targetDepartment === "VENDAS") {
        const vendedoras = await getVendedoras()
        if (vendedoras.length === 0) {
          // Sem vendedora cadastrada — cai direto na fila do setor.
          await markWaitingForAgent(contact.id, "VENDAS")
          await sendUraMessage(
            contact,
            `✅ Você selecionou *${chosen.label}*.\nUm de nossos atendentes já vai te responder. 🙏`,
          )
          return
        }
        await markAwaitingVendedora(contact.whatsappId)
        await sendUraMessage(contact, buildVendedorasMenu(vendedoras))
        return
      }

      // Demais setores: sempre vai pra Fila de espera com o setor escolhido.
      await markWaitingForAgent(contact.id, chosen.targetDepartment)
      await sendUraMessage(
        contact,
        `✅ Você selecionou *${chosen.label}*.\nUm de nossos atendentes já vai te responder. 🙏`,
      )
    } else {
      await sendUraMessage(contact, `⚠️ Opção inválida. Por favor, escolha:\n\n${cfg.greetingText}`)
    }
  }
  // WAITING_AGENT / IN_SERVICE: nada a fazer.
}

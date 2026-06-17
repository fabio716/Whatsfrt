// ═══════════════════════════════════════════════════════════════════════════
// Service Tracking — gerencia transições do chatStatus e cria ServiceSessions.
// Esses helpers existem para que toda mudança de status passe pelo mesmo
// lugar e os timestamps fiquem consistentes (espera, atendimento, fim).
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { ChatStatus } from "@/generated/prisma/enums"

// Chamado quando a URA decide que o contato precisa de agente humano.
export async function markWaitingForAgent(contactId: string): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      chatStatus: ChatStatus.WAITING_AGENT,
      waitingAgentSince: new Date(),
    },
  })
}

// Chamado quando um agente assume o contato (botão "Assumir" no chat).
// Cria a ServiceSession que vai durar até "encerrar".
export async function assignAgent(
  contactId: string,
  agentId: string,
): Promise<{ sessionId: string }> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { waitingAgentSince: true, chatStatus: true },
  })
  if (!contact) throw new Error("Contact not found")

  const now = new Date()
  // Se o contato nunca passou por WAITING_AGENT (ex: agente assumiu direto
  // um contato IDLE/importado), o "waitingFrom" é o próprio "now" — espera 0.
  const waitingFrom = contact.waitingAgentSince ?? now

  const session = await prisma.serviceSession.create({
    data: {
      contactId,
      agentId,
      waitingFrom,
      startedAt: now,
    },
    select: { id: true },
  })

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      assignedUserId: agentId,
      chatStatus: ChatStatus.IN_SERVICE,
      inServiceSince: now,
    },
  })

  return { sessionId: session.id }
}

// Encerra a session ativa do contato. Idempotente — se já estiver encerrada,
// retorna a existente sem mudar nada.
export async function endActiveSession(
  contactId: string,
  opts: { autoEnded?: boolean } = {},
): Promise<{ session: { id: string; agentId: string } | null }> {
  const active = await prisma.serviceSession.findFirst({
    where: { contactId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, agentId: true },
  })

  if (!active) return { session: null }

  await prisma.serviceSession.update({
    where: { id: active.id },
    data: {
      endedAt: new Date(),
      autoEnded: opts.autoEnded ?? false,
    },
  })

  return { session: active }
}

// Marca que pedimos a nota — entra em AWAITING_RATING. Próxima mensagem
// inbound do contato é interpretada como nota.
export async function markAwaitingRating(
  contactId: string,
  sessionId: string,
): Promise<void> {
  const now = new Date()
  await prisma.$transaction([
    prisma.serviceSession.update({
      where: { id: sessionId },
      data: { ratingRequestedAt: now },
    }),
    prisma.contact.update({
      where: { id: contactId },
      data: {
        chatStatus: ChatStatus.AWAITING_RATING,
      },
    }),
  ])
}

// Aplica nota recebida + comentário opcional. Volta o contato para IDLE
// (livre para nova interação) e limpa o assignedUser.
export async function applyRating(
  contactId: string,
  rating: number,
  comment: string | null,
): Promise<{ sessionId: string | null }> {
  const active = await prisma.serviceSession.findFirst({
    where: { contactId, ratingRequestedAt: { not: null }, ratedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  })

  if (!active) return { sessionId: null }

  await prisma.$transaction([
    prisma.serviceSession.update({
      where: { id: active.id },
      data: {
        rating,
        comment,
        ratedAt: new Date(),
      },
    }),
    prisma.contact.update({
      where: { id: contactId },
      data: {
        chatStatus: ChatStatus.IDLE,
        assignedUserId: null,
        inServiceSince: null,
        waitingAgentSince: null,
      },
    }),
  ])

  return { sessionId: active.id }
}

// Encerra sem nota (timeout do pedido de nota OU cliente respondeu coisa
// que não é nota). Volta para IDLE preservando a session.
export async function abandonRating(contactId: string): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      chatStatus: ChatStatus.IDLE,
      assignedUserId: null,
      inServiceSince: null,
      waitingAgentSince: null,
    },
  })
}

// Parser de nota. Aceita:
//   "5"               → { rating: 5, comment: null }
//   "5 muito bom"     → { rating: 5, comment: "muito bom" }
//   "Nota 4"          → { rating: 4, comment: null }  (extrai primeiro 1-5)
//   "obrigado"        → null
export function parseRating(text: string): { rating: number; comment: string | null } | null {
  const trimmed = text.trim()
  // Primeira ocorrência de dígito 1-5 isolado por borda de palavra
  const match = trimmed.match(/\b([1-5])\b/)
  if (!match) return null
  const rating = Number.parseInt(match[1], 10)
  // Comment = tudo depois do dígito (com fallback null se vazio)
  const after = trimmed.slice(match.index! + match[0].length).trim()
  return { rating, comment: after.length > 0 ? after.slice(0, 500) : null }
}

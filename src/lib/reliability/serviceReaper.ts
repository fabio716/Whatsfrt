// ═══════════════════════════════════════════════════════════════════════════
// Service Reaper — encerra atendimentos esquecidos.
//
// Cenários cobertos:
//   1. Agente assumiu, ficou 30min sem trocar mensagem → auto-encerra
//   2. Cliente em AWAITING_RATING há > 30min sem responder → libera contato
//
// Roda a cada 5 minutos. Idempotente — pode rodar 2x sem efeito.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { sendEvolutionText } from "@/lib/evolution"
import { abandonRating, endActiveSession } from "@/lib/serviceTracking"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"

const REAP_INTERVAL_MS = 5 * 60 * 1000
const STALE_SERVICE_AFTER_MS = 30 * 60 * 1000 // sem mensagem por 30min
const STALE_RATING_AFTER_MS = 30 * 60 * 1000 // sem responder nota por 30min

const RATING_TIMEOUT_MSG = "Atendimento encerrado por inatividade. Se precisar de novo, é só mandar uma mensagem que voltamos a te atender."

let timer: ReturnType<typeof setInterval> | null = null

async function reapStaleServices(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SERVICE_AFTER_MS)
  // Contatos em IN_SERVICE cuja última mensagem foi há > 30min
  const stale = await prisma.contact.findMany({
    where: {
      chatStatus: "IN_SERVICE",
      messages: {
        none: { createdAt: { gte: cutoff } },
      },
    },
    select: { id: true, whatsappId: true, name: true, assignedUserId: true },
    take: 50,
  })

  let count = 0
  for (const c of stale) {
    try {
      await endActiveSession(c.id, { autoEnded: true })
      await prisma.contact.update({
        where: { id: c.id },
        data: {
          chatStatus: "IDLE",
          assignedUserId: null,
          inServiceSince: null,
          waitingAgentSince: null,
        },
      })
      count += 1
    } catch (err) {
      console.error(`[serviceReaper] falha ao encerrar ${c.id}:`, err)
    }
  }

  if (count > 0) console.warn(`[serviceReaper] encerrei ${count} atendimentos inativos (>30min sem msg)`)
  return count
}

async function reapStaleRatingRequests(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_RATING_AFTER_MS)
  const stale = await prisma.serviceSession.findMany({
    where: {
      ratingRequestedAt: { lt: cutoff, not: null },
      ratedAt: null,
      endedAt: { not: null },
      contact: { chatStatus: "AWAITING_RATING" },
    },
    select: {
      id: true,
      contact: { select: { id: true, whatsappId: true } },
    },
    take: 50,
  })

  let count = 0
  for (const s of stale) {
    try {
      await abandonRating(s.contact.id)
      // Manda mensagem amigável avisando que encerrou
      const ok = await sendEvolutionText(s.contact.whatsappId, RATING_TIMEOUT_MSG)
      await prisma.message.create({
        data: {
          body: RATING_TIMEOUT_MSG,
          direction: MessageDirection.OUTBOUND,
          status: ok ? MessageStatus.SENT : MessageStatus.FAILED,
          contactId: s.contact.id,
        },
      })
      count += 1
    } catch (err) {
      console.error(`[serviceReaper] falha em rating timeout ${s.contact.id}:`, err)
    }
  }

  if (count > 0) console.warn(`[serviceReaper] ${count} pedidos de nota expirados`)
  return count
}

async function tick(): Promise<void> {
  try {
    await reapStaleServices()
    await reapStaleRatingRequests()
  } catch (err) {
    console.error("[serviceReaper] tick error:", err)
  }
}

export function startServiceReaper(): void {
  if (timer) return
  setTimeout(() => void tick(), 90_000) // primeiro tick em 90s
  timer = setInterval(() => void tick(), REAP_INTERVAL_MS)
  console.log("[serviceReaper] iniciado (a cada 5 min)")
}

export function stopServiceReaper(): void {
  if (timer) clearInterval(timer)
  timer = null
}

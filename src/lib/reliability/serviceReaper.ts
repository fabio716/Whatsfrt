// ═══════════════════════════════════════════════════════════════════════════
// Service Reaper — housekeeping de atendimentos.
//
// Cenários cobertos:
//   1. Atendimento IN_SERVICE parado há muito tempo → APENAS log (observabili-
//      dade). NAO encerra, NAO desatribui — politica "nada some sozinho".
//   2. Cliente em AWAITING_RATING há > 2h sem responder → libera o pedido de
//      nota (o atendimento ja tinha sido encerrado manualmente pela agente).
//
// Roda a cada 5 minutos. Idempotente — pode rodar 2x sem efeito.
//
// ⚠ HISTORICO: ate 2026-07 o cenario 1 zerava assignedUserId + chatStatus=IDLE
// dos contatos parados. Como o painel filtra por assignedUserId e esconde IDLE,
// a conversa SUMIA da tela da agente sem aviso (pior com cliente novo que ainda
// nao respondeu) e ela nao conseguia mais enviar. Isso foi REMOVIDO: o cenario
// 1 nao toca mais no estado do contato, mesmo com SERVICE_REAPER=on. Encerrar
// atendimento passou a ser 100% manual (botao "Encerrar atendimento").
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { sendEvolutionText } from "@/lib/evolution"
import { abandonRating } from "@/lib/serviceTracking"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"

const REAP_INTERVAL_MS = 5 * 60 * 1000
const STALE_SERVICE_HOURS = Number.parseFloat(process.env.SERVICE_STALE_HOURS ?? "4")
const STALE_SERVICE_AFTER_MS = STALE_SERVICE_HOURS * 60 * 60 * 1000
const STALE_RATING_AFTER_MS = 2 * 60 * 60 * 1000 // 2h sem responder nota

const RATING_TIMEOUT_MSG = "Atendimento encerrado por inatividade. Se precisar de novo, é só mandar uma mensagem que voltamos a te atender."

let timer: ReturnType<typeof setInterval> | null = null

async function reapStaleServices(): Promise<number> {
  // POLITICA (2026-07): NADA some sozinho. Uma conversa em atendimento NUNCA
  // e desatribuida/escondida automaticamente — quem encerra e a agente, pelo
  // botao "Encerrar atendimento".
  //
  // Antes esta funcao zerava assignedUserId + chatStatus=IDLE de contatos
  // IN_SERVICE sem msg recente. Como o painel filtra por assignedUserId e
  // esconde IDLE, a conversa SUMIA da tela da agente sem aviso — pior com
  // cliente novo que ainda nao respondeu (so tem msgs de saida, o relogio
  // nunca renova). Isso derrubava tambem o envio: sem o contato na lista, a
  // agente nao conseguia abrir pra mandar mensagem.
  //
  // Agora e apenas observabilidade: contamos quantos estariam "parados", sem
  // JAMAIS tocar no estado do contato. Vale mesmo com SERVICE_REAPER=on.
  const cutoff = new Date(Date.now() - STALE_SERVICE_AFTER_MS)
  const staleCount = await prisma.contact.count({
    where: {
      chatStatus: "IN_SERVICE",
      messages: { none: { createdAt: { gte: cutoff } } },
    },
  })

  if (staleCount > 0) {
    console.log(
      `[serviceReaper] ${staleCount} atendimentos parados (>${STALE_SERVICE_HOURS}h sem msg) — ` +
      "NAO encerrados (politica: agente encerra manual, nada some sozinho)",
    )
  }
  return 0
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

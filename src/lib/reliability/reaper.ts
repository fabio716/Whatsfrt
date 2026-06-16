// ═══════════════════════════════════════════════════════════════════════════
// Reaper de mensagens PENDING/PROCESSING travadas.
//
// Cenário: processo morre entre `prisma.message.create({status:PENDING})` e
// `prisma.message.update({status:SENT})`. A mensagem fica eternamente PENDING.
// Operador vê balão amarelo que nunca vira ✓.
//
// Reaper roda a cada 5 min. Para mensagens OUTBOUND com status PENDING criadas
// há mais de 10 min, marca FAILED com errorMsg explicativo e dispara SSE pra
// o UI atualizar.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { broadcast } from "@/lib/sse-emitter"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"

const REAP_INTERVAL_MS = 5 * 60 * 1000
const STUCK_AFTER_MS = 10 * 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null

async function reap(): Promise<void> {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS)
  try {
    const stuck = await prisma.message.findMany({
      where: {
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.PENDING,
        createdAt: { lt: cutoff },
      },
      select: { id: true, contactId: true },
      take: 200,
    })

    if (stuck.length === 0) return

    console.warn(`[reaper] marcando ${stuck.length} mensagens PENDING como FAILED (>10min sem resolver)`)

    await prisma.message.updateMany({
      where: { id: { in: stuck.map((m) => m.id) } },
      data: {
        status: MessageStatus.FAILED,
        errorMsg: "reaper: pipeline interrompido (processo morreu antes de receber resposta da Evolution)",
      },
    })

    for (const m of stuck) {
      broadcast({
        type: "message_update",
        data: { id: m.id, status: "FAILED", contactId: m.contactId },
      })
    }
  } catch (err) {
    console.error("[reaper] tick error:", err)
  }
}

export function startReaper(): void {
  if (timer) return
  // Primeira execução em 1 min — dá tempo do app estabilizar.
  setTimeout(() => void reap(), 60_000)
  timer = setInterval(() => void reap(), REAP_INTERVAL_MS)
  console.log("[reaper] iniciado (a cada 5 min)")
}

export function stopReaper(): void {
  if (timer) clearInterval(timer)
  timer = null
}

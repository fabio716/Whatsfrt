// ═══════════════════════════════════════════════════════════════════════════
// Aviso de lembretes de retorno. A cada minuto procura lembretes que venceram
// e ainda não foram avisados, e avisa SÓ a dona: notificação no celular/PC
// (push) e evento na tela aberta (SSE). Não envia nada ao cliente.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { sendPushToUsers } from "@/lib/push"
import { broadcastToUsers } from "@/lib/sse-emitter"

const CHECK_INTERVAL_MS = 60 * 1000

let timer: ReturnType<typeof setInterval> | null = null
let rodando = false

async function avisarVencidos(): Promise<void> {
  if (rodando) return
  rodando = true
  try {
    const vencidos = await prisma.contactReminder.findMany({
      where: { doneAt: null, notifiedAt: null, dueAt: { lte: new Date() }, contact: { deletedAt: null } },
      orderBy: { dueAt: "asc" },
      take: 100,
      select: { id: true, userId: true, dueAt: true, note: true, contact: { select: { id: true, name: true } } },
    })
    for (const l of vencidos) {
      // Marca antes de avisar: se o push falhar, não fica avisando em loop.
      const marcado = await prisma.contactReminder.updateMany({
        where: { id: l.id, notifiedAt: null },
        data: { notifiedAt: new Date() },
      })
      if (marcado.count === 0) continue // outro processo já avisou

      broadcastToUsers([l.userId], {
        type: "reminder_due",
        data: { id: l.id, contactId: l.contact.id, contactName: l.contact.name, note: l.note, dueAt: l.dueAt.toISOString() },
      })
      sendPushToUsers([l.userId], {
        title: `⏰ Retornar: ${l.contact.name}`,
        body: l.note || "Hora de falar com este cliente.",
        tag: `lembrete-${l.id}`,
        url: `/admin/chats?contact=${l.contact.id}`,
      }).catch((e: unknown) => console.error("[lembretes] push falhou:", e instanceof Error ? e.message : e))
    }
  } catch (err) {
    console.error("[lembretes] tick error:", err instanceof Error ? err.message : err)
  } finally {
    rodando = false
  }
}

export function startReminderNotifier(): void {
  if (timer) return
  timer = setInterval(() => { void avisarVencidos() }, CHECK_INTERVAL_MS)
  void avisarVencidos()
  console.log("[lembretes] aviso de retornos ativo (a cada 60s)")
}

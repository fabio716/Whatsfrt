// ═══════════════════════════════════════════════════════════════════════════
// Aviso de lembretes de retorno. A cada minuto procura lembretes que venceram
// e ainda não foram avisados, e avisa SÓ a dona: notificação no celular/PC
// (push) e evento na tela aberta (SSE). Não envia nada ao cliente.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { sendPushToUsers } from "@/lib/push"
import { broadcastToUsers } from "@/lib/sse-emitter"
import { getUraConfigCached } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"
import { atendimentosHumanos } from "@/lib/retornoAtendido"

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

// ─── Retorno atrasado → avisa a diretoria e a própria vendedora ─────────────
// Vale só para os retornos deixados pelo atendente virtual (🤖): é o cliente
// que ficou esperando a ligação. Passou 30 min do horário combinado e não foi
// concluído → os administradores recebem o alerta e a vendedora é avisada de
// que a diretoria foi avisada. Só dispara em horário de expediente (nunca
// de madrugada) e uma vez por retorno; adiar o retorno rearma o alerta.
const TOLERANCIA_MS = 30 * 60 * 1000
const JANELA_MAX_MS = 24 * 60 * 60 * 1000
let escalando = false

const horaBr = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

export async function escalarAtrasados(): Promise<number> {
  if (escalando) return 0
  escalando = true
  try {
    const cfg = await getUraConfigCached()
    if (cfg.isActive && isBusinessHour(cfg) !== "OPEN") return 0

    const agora = Date.now()
    const atrasados = await prisma.contactReminder.findMany({
      where: {
        doneAt: null,
        escalonadoAt: null,
        note: { startsWith: "🤖" },
        dueAt: { lte: new Date(agora - TOLERANCIA_MS), gte: new Date(agora - JANELA_MAX_MS) },
        contact: { deletedAt: null },
      },
      orderBy: { dueAt: "asc" },
      take: 50,
      select: {
        id: true, userId: true, dueAt: true, createdAt: true,
        user: { select: { name: true } },
        contact: { select: { id: true, name: true } },
      },
    })
    if (atrasados.length === 0) return 0

    // Quem já respondeu o cliente não é cobrado nem entra no alerta.
    const atendidos = await atendimentosHumanos(atrasados.map((l) => ({ id: l.id, contactId: l.contact.id, desde: l.createdAt })))
    const esperando = atrasados.filter((l) => !atendidos.has(l.id))
    if (esperando.length === 0) return 0

    const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })
    const adminIds = admins.map((a) => a.id)
    let total = 0
    for (const l of esperando) {
      // Marca antes de avisar (mesma regra do aviso de vencimento) e pede nova
      // ciência da vendedora: ela vê a tela de retornos de novo, agora com o aviso.
      const marcado = await prisma.contactReminder.updateMany({
        where: { id: l.id, escalonadoAt: null, doneAt: null },
        data: { escalonadoAt: new Date(), cienteAt: null },
      })
      if (marcado.count === 0) continue
      total++
      const minutos = Math.round((agora - l.dueAt.getTime()) / 60_000)
      sendPushToUsers(adminIds, {
        title: `⚠️ Retorno atrasado: ${l.user.name}`,
        body: `${l.contact.name} esperava retorno às ${horaBr(l.dueAt)} (há ${minutos} min).`,
        tag: `atraso-${l.id}`,
        url: `/admin/chats?contact=${l.contact.id}`,
      }).catch((e: unknown) => console.error("[lembretes] push diretoria falhou:", e instanceof Error ? e.message : e))
      sendPushToUsers([l.userId], {
        title: "⚠️ Retorno atrasado — a diretoria foi avisada",
        body: `${l.contact.name} esperava seu retorno às ${horaBr(l.dueAt)}. Faça agora e conclua em Retornos.`,
        tag: `atraso-${l.id}`,
        url: `/admin/chats?contact=${l.contact.id}`,
      }).catch((e: unknown) => console.error("[lembretes] push vendedora falhou:", e instanceof Error ? e.message : e))
    }
    return total
  } catch (err) {
    console.error("[lembretes] escalonamento falhou:", err instanceof Error ? err.message : err)
    return 0
  } finally {
    escalando = false
  }
}

export function startReminderNotifier(): void {
  if (timer) return
  timer = setInterval(() => { void avisarVencidos(); void escalarAtrasados() }, CHECK_INTERVAL_MS)
  void avisarVencidos()
  console.log("[lembretes] aviso de retornos ativo (a cada 60s)")
}

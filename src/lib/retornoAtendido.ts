// ═══════════════════════════════════════════════════════════════════════════
// Estado de um retorno: "atendido" quando uma PESSOA (vendedora/administrador)
// respondeu ao cliente depois que o retorno foi criado. Mensagem do atendente
// virtual não conta. Serve pra não cobrar quem já atendeu e pra mostrar ao
// administrador se o cliente já foi atendido.
// ═══════════════════════════════════════════════════════════════════════════
import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"
import { Prisma } from "@/generated/prisma/client"

export interface Atendimento {
  em: Date
  por: string
}

// Chave do mapa = id do item passado (lembrete ou outro). `desde` = a partir de
// quando uma resposta humana conta como atendimento.
export async function atendimentosHumanos(
  itens: { id: string; contactId: string; desde: Date }[],
): Promise<Map<string, Atendimento>> {
  const resultado = new Map<string, Atendimento>()
  if (itens.length === 0) return resultado

  const menor = new Date(Math.min(...itens.map((i) => i.desde.getTime())))
  const mensagens = await prisma.message.findMany({
    where: {
      contactId: { in: [...new Set(itens.map((i) => i.contactId))] },
      direction: MessageDirection.OUTBOUND,
      agentId: { not: null },
      createdAt: { gt: menor },
    },
    orderBy: { createdAt: "asc" },
    take: 3000,
    select: { contactId: true, createdAt: true, agent: { select: { name: true } } },
  })
  for (const item of itens) {
    const m = mensagens.find((x) => x.contactId === item.contactId && x.createdAt > item.desde)
    if (m) resultado.set(item.id, { em: m.createdAt, por: m.agent?.name ?? "equipe" })
  }
  return resultado
}

// ─── Cumprimento do horário combinado ───────────────────────────────────────
// Respeitou = atendeu até 30 min depois do horário combinado (a mesma
// tolerância do alerta à diretoria). "Atendeu" = uma pessoa respondeu o
// cliente no chat OU marcou "Fiz o retorno" (quem liga por telefone).
export const TOLERANCIA_RETORNO_MS = 30 * 60 * 1000

export type StatusRetorno = "NO_PRAZO" | "COM_ATRASO" | "SEM_ATENDIMENTO" | "A_VENCER"

export function statusRetorno(
  r: { dueAt: Date; atendidoEm: Date | null },
  agora: Date,
): { status: StatusRetorno; atrasoMin: number } {
  if (r.atendidoEm) {
    const dif = r.atendidoEm.getTime() - r.dueAt.getTime()
    return { status: dif <= TOLERANCIA_RETORNO_MS ? "NO_PRAZO" : "COM_ATRASO", atrasoMin: Math.max(0, Math.round(dif / 60_000)) }
  }
  const espera = agora.getTime() - r.dueAt.getTime()
  if (espera > TOLERANCIA_RETORNO_MS) return { status: "SEM_ATENDIMENTO", atrasoMin: Math.round(espera / 60_000) }
  return { status: "A_VENCER", atrasoMin: 0 }
}

// Primeira resposta humana de cada retorno (depois que ele foi criado), numa
// consulta só — sem o limite de mensagens da versão acima.
export async function primeiraRespostaHumana(ids: string[]): Promise<Map<string, Date>> {
  const mapa = new Map<string, Date>()
  if (ids.length === 0) return mapa
  const linhas = await prisma.$queryRaw<{ id: string; em: Date }[]>(Prisma.sql`
    SELECT r.id AS id, MIN(m."createdAt") AS em
    FROM contact_reminders r
    JOIN messages m ON m."contactId" = r."contactId"
      AND m.direction = 'OUTBOUND' AND m."agentId" IS NOT NULL AND m."createdAt" > r."createdAt"
    WHERE r.id IN (${Prisma.join(ids)})
    GROUP BY r.id`)
  for (const l of linhas) mapa.set(l.id, new Date(l.em))
  return mapa
}

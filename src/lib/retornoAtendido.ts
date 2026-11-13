// ═══════════════════════════════════════════════════════════════════════════
// Estado de um retorno: "atendido" quando uma PESSOA (vendedora/administrador)
// respondeu ao cliente depois que o retorno foi criado. Mensagem do atendente
// virtual não conta. Serve pra não cobrar quem já atendeu e pra mostrar ao
// administrador se o cliente já foi atendido.
// ═══════════════════════════════════════════════════════════════════════════
import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"
import { Prisma } from "@/generated/prisma/client"

// Mensagens que levam o nome de uma pessoa mas NÃO são atendimento: envio em
// massa (transmissão) e o pedido de nota que sai ao encerrar um atendimento.
// Sem excluir, encerrar 5 atendimentos de uma vez contava como "atendeu 5 retornos".
export const PREFIXO_PEDIDO_NOTA = "🙏 Obrigado pelo contato! Antes de finalizar"

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
      isBroadcast: false,
      viaAtendente: false, // resposta do robô nunca é atendimento
      NOT: { body: { startsWith: PREFIXO_PEDIDO_NOTA } },
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
// Respeitou = a DONA do retorno respondeu o cliente no chat até 30 min depois
// do horário combinado (mesma tolerância do alerta à diretoria). Duas coisas
// NÃO provam o retorno, e ficam em situações próprias, fora da pontualidade:
//   • só marcou "Fiz o retorno" (sem conversa dela com o cliente — pode ter
//     sido telefone, ou clique pra limpar o aviso);
//   • outra pessoa respondeu o cliente (o cliente foi atendido, mas não por ela).
export const TOLERANCIA_RETORNO_MS = 30 * 60 * 1000

export type StatusRetorno =
  | "NO_PRAZO" | "COM_ATRASO" | "SEM_ATENDIMENTO" | "A_VENCER" | "SO_MARCOU" | "OUTRA_PESSOA"

export function statusRetorno(
  r: { dueAt: Date; donoEm: Date | null; marcouEm: Date | null; outroEm: Date | null },
  agora: Date,
): { status: StatusRetorno; atrasoMin: number } {
  if (r.donoEm) {
    const dif = r.donoEm.getTime() - r.dueAt.getTime()
    return { status: dif <= TOLERANCIA_RETORNO_MS ? "NO_PRAZO" : "COM_ATRASO", atrasoMin: Math.max(0, Math.round(dif / 60_000)) }
  }
  if (r.marcouEm) return { status: "SO_MARCOU", atrasoMin: Math.max(0, Math.round((r.marcouEm.getTime() - r.dueAt.getTime()) / 60_000)) }
  if (r.outroEm) return { status: "OUTRA_PESSOA", atrasoMin: 0 }
  const espera = agora.getTime() - r.dueAt.getTime()
  if (espera > TOLERANCIA_RETORNO_MS) return { status: "SEM_ATENDIMENTO", atrasoMin: Math.round(espera / 60_000) }
  return { status: "A_VENCER", atrasoMin: 0 }
}

export interface RespostasHumanas {
  dono: { em: Date; texto: string } | null
  outro: { em: Date; texto: string; por: string } | null
}

// Primeira resposta humana de cada retorno (depois que ele foi criado), da
// dona do retorno e de outra pessoa, numa consulta só. Devolve também o início
// do texto, pra o administrador conferir o que foi "o atendimento".
export async function primeiraRespostaHumana(ids: string[]): Promise<Map<string, RespostasHumanas>> {
  const mapa = new Map<string, RespostasHumanas>()
  if (ids.length === 0) return mapa
  const linhas = await prisma.$queryRaw<{ id: string; dono: boolean; em: Date; texto: string | null; por: string | null }[]>(Prisma.sql`
    SELECT DISTINCT ON (r.id, (m."agentId" = r."userId"))
      r.id AS id, (m."agentId" = r."userId") AS dono, m."createdAt" AS em, left(m.body, 90) AS texto, ua.name AS por
    FROM contact_reminders r
    JOIN messages m ON m."contactId" = r."contactId"
      AND m.direction = 'OUTBOUND' AND m."agentId" IS NOT NULL AND m."createdAt" > r."createdAt"
      AND m."isBroadcast" = false AND m."viaAtendente" = false AND m.body NOT LIKE ${PREFIXO_PEDIDO_NOTA + "%"}
    LEFT JOIN users ua ON ua.id = m."agentId"
    WHERE r.id IN (${Prisma.join(ids)})
    ORDER BY r.id, (m."agentId" = r."userId"), m."createdAt" ASC`)
  for (const l of linhas) {
    const atual = mapa.get(l.id) ?? { dono: null, outro: null }
    if (l.dono) atual.dono = { em: new Date(l.em), texto: l.texto ?? "" }
    else atual.outro = { em: new Date(l.em), texto: l.texto ?? "", por: l.por ?? "equipe" }
    mapa.set(l.id, atual)
  }
  return mapa
}

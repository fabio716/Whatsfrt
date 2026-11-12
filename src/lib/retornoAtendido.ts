// ═══════════════════════════════════════════════════════════════════════════
// Estado de um retorno: "atendido" quando uma PESSOA (vendedora/administrador)
// respondeu ao cliente depois que o retorno foi criado. Mensagem do atendente
// virtual não conta. Serve pra não cobrar quem já atendeu e pra mostrar ao
// administrador se o cliente já foi atendido.
// ═══════════════════════════════════════════════════════════════════════════
import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"

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

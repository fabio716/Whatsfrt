import { prisma } from "@/lib/prisma"

// ═══════════════════════════════════════════════════════════════════════════
// Conversa interna 1:1 — achar ou criar.
//
// Extraído de POST /api/internal/conversations pra não ficar duplicado: quem
// precisa mandar mensagem interna por outro caminho (o "pedir explicação" do
// relatório, por exemplo) usa a MESMA regra. Duas cópias da regra de "achar a
// DM entre duas pessoas" viram duas conversas paralelas com o mesmo par no
// dia em que uma delas mudar.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Devolve o id da conversa direta entre os dois, criando se ainda não existe.
 * `null` quando o outro usuário não existe ou está inativo.
 */
export async function acharOuCriarDM(meId: string, outroId: string): Promise<string | null> {
  if (meId === outroId) return null

  const outro = await prisma.user.findFirst({
    where: { id: outroId, isActive: true },
    select: { id: true },
  })
  if (!outro) return null

  const minhas = await prisma.internalConversationMember.findMany({
    where: { userId: meId },
    select: { conversationId: true },
  })
  const meusIds = minhas.map((m) => m.conversationId)

  if (meusIds.length > 0) {
    const compartilhadas = await prisma.internalConversationMember.findMany({
      where: { userId: outroId, conversationId: { in: meusIds } },
      select: { conversationId: true },
    })
    for (const c of compartilhadas) {
      const conv = await prisma.internalConversation.findUnique({
        where: { id: c.conversationId },
        select: { id: true, isGroup: true, _count: { select: { members: true } } },
      })
      // Só serve a conversa que é DM mesmo: grupo de 2 pessoas não conta.
      if (conv && !conv.isGroup && conv._count.members === 2) return conv.id
    }
  }

  const criada = await prisma.internalConversation.create({
    data: {
      isGroup: false,
      createdById: meId,
      members: { create: [{ userId: meId, lastReadAt: new Date() }, { userId: outroId }] },
    },
    select: { id: true },
  })
  return criada.id
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { ChatStatus, MessageDirection } from "@/generated/prisma/enums"

// Fila de espera visivel pra agentes e admin. Retorna contatos que estao
// aguardando um agente humano (WAITING_AGENT) — inclui os que a URA nao
// conseguiu auto-atribuir. Cada item ja vem com a ultima mensagem inbound
// pra ajudar o agente a decidir se pega ou nao.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const contacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      assignedUserId: null,
      chatStatus: { in: [ChatStatus.WAITING_AGENT, ChatStatus.IN_URA] },
    },
    select: {
      id: true,
      whatsappId: true,
      name: true,
      profilePhotoUrl: true,
      chatStatus: true,
      waitingAgentSince: true,
      empresa: true,
      cidade: true,
      messages: {
        where: { direction: MessageDirection.INBOUND },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, createdAt: true },
      },
    },
    orderBy: [
      { waitingAgentSince: "asc" },
      { updatedAt: "desc" },
    ],
    take: 100,
  })

  const items = contacts.map((c) => ({
    id: c.id,
    whatsappId: c.whatsappId,
    name: c.name,
    profilePhotoUrl: c.profilePhotoUrl,
    chatStatus: c.chatStatus,
    waitingAgentSince: c.waitingAgentSince?.toISOString() ?? null,
    empresa: c.empresa,
    cidade: c.cidade,
    lastMessage: c.messages[0]?.body ?? null,
    lastMessageAt: c.messages[0]?.createdAt.toISOString() ?? null,
  }))

  return NextResponse.json({ queue: items, timestamp: new Date().toISOString() })
}

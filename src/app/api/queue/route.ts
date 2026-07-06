import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { ChatStatus, MessageDirection } from "@/generated/prisma/enums"

// Fila de espera. Admin ve TUDO; agente ve APENAS contatos cujo setor
// escolhido na URA (pendingDepartment) bate com o departamento cadastrado
// do agente — pra que agente de Financeiro nao pegue lead que era de Vendas
// e vice versa.
//
// Contatos sem pendingDepartment (entrada fora do fluxo URA — audio-only,
// contato importado, etc.) so aparecem pro admin decidir o destino.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  let agentDepartment: string | null = null
  if (session.role === "AGENT") {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { department: true },
    })
    agentDepartment = user?.department ?? null
    // Agente sem departamento cadastrado nao ve fila nenhuma — evita ver
    // tudo por acidente. Admin deve corrigir o cadastro em /admin/users.
    if (!agentDepartment) {
      return NextResponse.json({ queue: [], timestamp: new Date().toISOString() })
    }
  }

  const contacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      assignedUserId: null,
      chatStatus: { in: [ChatStatus.WAITING_AGENT, ChatStatus.IN_URA] },
      ...(session.role === "AGENT" ? { pendingDepartment: agentDepartment } : {}),
    },
    select: {
      id: true,
      whatsappId: true,
      name: true,
      profilePhotoUrl: true,
      chatStatus: true,
      waitingAgentSince: true,
      pendingDepartment: true,
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
    pendingDepartment: c.pendingDepartment,
    empresa: c.empresa,
    cidade: c.cidade,
    lastMessage: c.messages[0]?.body ?? null,
    lastMessageAt: c.messages[0]?.createdAt.toISOString() ?? null,
  }))

  return NextResponse.json({ queue: items, timestamp: new Date().toISOString() })
}

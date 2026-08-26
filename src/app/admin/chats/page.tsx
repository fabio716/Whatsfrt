import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { ChatStatus } from "@/generated/prisma/enums"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import { ContactData } from "@/app/admin/dashboard/types"
import ChatsClient from "./components/ChatsClient"

export const dynamic = "force-dynamic"

export const metadata = { title: "Chats · WhatsFRT" }

export default async function ChatsPage(
  { searchParams }: Readonly<{ searchParams: Promise<{ contact?: string }> }>
) {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  if (!session) redirect("/login")

  const isAgent = session.role === "AGENT"
  const { contact: requestedContactId } = await searchParams

  // Mesma janela do Dashboard: chats ativos OU com msg nos últimos 7 dias.
  // Antes mostrava só IN_SERVICE e admin via "0 contatos" mesmo com
  // dezenas de conversas em aberto noutro estado.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  // Chats são PRIVADOS: cada agente só vê os atendimentos da própria carteira.
  // (Contatos são compartilhados via /api/clientes, mas o chat não.)
  const inServiceWhere = {
    deletedAt: null,
    ...(isAgent ? { assignedUserId: session.id } : {}),
    OR: [
      { chatStatus: { in: [ChatStatus.IN_URA, ChatStatus.WAITING_AGENT, ChatStatus.IN_SERVICE, ChatStatus.AWAITING_RATING] } },
      { messages: { some: { createdAt: { gte: sevenDaysAgo } } } },
    ],
  }

  // 2 — Se a URL pede um contato específico (?contact=…), inclui ele
  //     mesmo que não esteja em IN_SERVICE. Útil pra abrir conversa
  //     a partir de /admin/clientes.
  const requestedWhere = requestedContactId
    ? {
        id: requestedContactId,
        deletedAt: null,
        ...(isAgent ? { assignedUserId: session.id } : {}),
      }
    : null

  const [inServiceContacts, requestedContact, allAgents] = await Promise.all([
    prisma.contact.findMany({
      where: inServiceWhere,
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    requestedWhere
      ? prisma.contact.findUnique({
          where: { id: requestedContactId! },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        })
      : Promise.resolve(null),
    prisma.user.findMany({
      // Admin nao recebe chats — manter na lista confunde o filtro do painel
      // (admin se autoselecionava sem querer e via 0 contatos).
      where: { isActive: true, role: "AGENT" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  // Junta: se o contato pedido não está na lista IN_SERVICE, adiciona ele.
  // Garante que /admin/chats?contact=X sempre abre X, mesmo IDLE.
  const rawContacts = [...inServiceContacts]
  if (
    requestedContact &&
    !rawContacts.some((c) => c.id === requestedContact.id) &&
    // Chat privado: AGENT só abre contato da própria carteira.
    (!isAgent || requestedContact.assignedUserId === session.id)
  ) {
    rawContacts.unshift(requestedContact)
  }

  // Lista de agentes ativa vai pra AGENT tambem — usada pelo modal de
  // Transferir conversa (agente pode transferir contato proprio pra colega).
  // Antes vinha [] pra AGENT porque so admin transferia; agora AGENT tambem
  // precisa ver a lista de destinatarios possiveis.
  const agents = allAgents

  const contacts: ContactData[] = rawContacts.map((c) => ({
    id: c.id,
    whatsappId: c.whatsappId,
    name: c.name,
    profilePhotoUrl: c.profilePhotoUrl,
    chatStatus: c.chatStatus,
    assignedUserId: c.assignedUserId,
    // Histórico completo sempre visível, mesmo depois de um takeover — o
    // corte por historyResetAt foi removido a pedido (ficava confuso o
    // agente achar que tinha "sumido" conversa que sempre foi do cliente).
    // adminPrivate: admin respondeu direto num contato de outro agente —
    // fica invisível pro dono do contato (privacidade), só o admin vê.
    messages: c.messages
      .filter((m) => !isAgent || !m.adminPrivate)
      .map((m) => ({
        id: m.id,
        body: m.body,
        direction: m.direction,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        agentId: m.agentId,
        mediaUrl: m.mediaUrl,
        mediaType: m.mediaType,
      })),
  }))

  return (
    <ChatsClient
      contacts={contacts}
      agents={agents}
      currentUserId={session.id}
      isAgent={isAgent}
    />
  )
}

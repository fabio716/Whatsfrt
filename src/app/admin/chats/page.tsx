import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
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

  // 1 — IN_SERVICE: chats ativos (lista padrão)
  const inServiceWhere = {
    deletedAt: null,
    chatStatus: "IN_SERVICE" as const,
    ...(isAgent ? { assignedUserId: session.id } : {}),
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
      where: { isActive: true },
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
    // Reforço de segurança: AGENT só pode ver contato próprio
    (!isAgent || requestedContact.assignedUserId === session.id)
  ) {
    rawContacts.unshift(requestedContact)
  }

  const agents = isAgent ? [] : allAgents

  const contacts: ContactData[] = rawContacts.map((c) => ({
    id: c.id,
    whatsappId: c.whatsappId,
    name: c.name,
    profilePhotoUrl: c.profilePhotoUrl,
    chatStatus: c.chatStatus,
    assignedUserId: c.assignedUserId,
    messages: c.messages.map((m) => ({
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

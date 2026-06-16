import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import { ContactData } from "@/app/admin/dashboard/types"
import ChatsClient from "./components/ChatsClient"

export const dynamic = "force-dynamic"

export const metadata = { title: "Chats · WhatsFRT" }

export default async function ChatsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  const isAgent = session?.role === "AGENT"

  const [rawContacts, allAgents] = await Promise.all([
    prisma.contact.findMany({
      where: {
        deletedAt: null,
        chatStatus: "IN_SERVICE",
        // Agents only ever see their own assigned conversations.
        ...(isAgent ? { assignedUserId: session?.id } : {}),
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ])

  // Agents must never receive other users' names (filter is admin-only).
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
      currentUserId={session?.id ?? ""}
      isAgent={isAgent}
    />
  )
}

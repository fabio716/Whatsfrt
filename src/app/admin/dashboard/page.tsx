import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import { ContactData } from "./types"
import DashboardClient from "./components/DashboardClient"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Dashboard · WhatsFRT",
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")

  const isAgent = session.role === "AGENT"

  // Mostra só conversas em aberto OU com mensagem nos últimos 7 dias.
  // Contatos puramente importados (sem chat) ficam em /admin/contatos.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const raw = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      ...(isAgent ? { assignedUserId: session.id } : {}),
      OR: [
        { chatStatus: { in: ["IN_URA", "WAITING_AGENT", "IN_SERVICE", "AWAITING_RATING"] } },
        { messages: { some: { createdAt: { gte: sevenDaysAgo } } } },
      ],
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  })

  const contacts: ContactData[] = raw
    .sort((a, b) => {
      const lastA = a.messages.at(-1)?.createdAt
      const lastB = b.messages.at(-1)?.createdAt
      if (!lastA && !lastB) return 0
      if (!lastA) return 1
      if (!lastB) return -1
      return lastB.getTime() - lastA.getTime()
    })
    .map((c) => ({
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

  return <DashboardClient contacts={contacts} />
}

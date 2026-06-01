import { prisma } from "@/lib/prisma"
import { ContactData } from "./types"
import DashboardClient from "./components/DashboardClient"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Dashboard · WhatsFRT",
}

export default async function DashboardPage() {
  const raw = await prisma.contact.findMany({
    where: { deletedAt: null },
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

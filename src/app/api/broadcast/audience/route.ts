import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionFromRequest } from "@/lib/auth"

// GET /api/broadcast/audience?cooperativeId=<id>
// Returns the cooperatives available for filtering and the contacts the current
// user is allowed to broadcast to. Agents are scoped to their own contacts;
// admins see all. Optional cooperativeId narrows the contact list.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const isAgent = session.role === "AGENT"
  const cooperativeId = request.nextUrl.searchParams.get("cooperativeId")

  const contactWhere: Record<string, unknown> = {
    deletedAt: null,
    // Cannot broadcast to internal @lid ids (not real phone numbers)
    whatsappId: { not: { contains: "@lid" } },
    ...(isAgent ? { assignedUserId: session.id } : {}),
    ...(cooperativeId ? { cooperativeId } : {}),
  }

  const [cooperatives, contacts] = await Promise.all([
    prisma.cooperative.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.contact.findMany({
      where: contactWhere,
      select: { id: true, name: true, whatsappId: true, cooperativeId: true, chatStatus: true },
      orderBy: { name: "asc" },
    }),
  ])

  // Data da última mensagem (qualquer direção) por contato — base pra
  // "sugerir" quem já está conversando, em vez de mandar às cegas pra quem
  // nunca respondeu (mais chance de incomodar ou de a Meta nem entregar).
  const lastMessages = contacts.length
    ? await prisma.message.findMany({
        where: { contactId: { in: contacts.map((c) => c.id) } },
        orderBy: { createdAt: "desc" },
        distinct: ["contactId"],
        select: { contactId: true, createdAt: true },
      })
    : []
  const lastMessageByContact = new Map(lastMessages.map((m) => [m.contactId, m.createdAt]))

  const contactsWithActivity = contacts.map((c) => ({
    ...c,
    lastMessageAt: lastMessageByContact.get(c.id) ?? null,
  }))

  return NextResponse.json({ cooperatives, contacts: contactsWithActivity })
}

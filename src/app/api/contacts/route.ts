import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionFromRequest } from "@/lib/auth"
import { normalizePhone } from "@/lib/contactImport"

// POST /api/contacts — create a single contact for the logged-in user.
// Available to every authenticated user (admins and agents). The contact is
// assigned to whoever creates it, keeping each user's list isolated.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  let body: { name?: string; phone?: string }
  try {
    body = (await request.json()) as { name?: string; phone?: string }
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const name = body.name?.trim()
  const rawPhone = body.phone?.trim()
  if (!name || !rawPhone) {
    return NextResponse.json({ error: "Nome e telefone são obrigatórios" }, { status: 400 })
  }

  const whatsappId = normalizePhone(rawPhone)
  if (!whatsappId) {
    return NextResponse.json({ error: "Telefone inválido. Use DDD + número (ex: 11 99999-9999)" }, { status: 422 })
  }

  const existing = await prisma.contact.findUnique({
    where: { whatsappId },
    select: { id: true, assignedUserId: true, deletedAt: true },
  })

  // Prevent stealing a contact that already belongs to another user.
  if (existing && !existing.deletedAt && existing.assignedUserId && existing.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Este contato já pertence a outro usuário" }, { status: 409 })
  }

  const contact = await prisma.contact.upsert({
    where: { whatsappId },
    create: {
      whatsappId,
      name,
      assignedUserId: session.id,
      chatStatus: "IDLE",
    },
    update: {
      name,
      assignedUserId: session.id,
      deletedAt: null,
    },
    select: { id: true, name: true, whatsappId: true },
  })

  const created = !existing
  return NextResponse.json({ ...contact, created }, { status: created ? 201 : 200 })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// ─── Lembretes de retorno ─────────────────────────────────────────────────────
// A vendedora marca "me lembrar de falar com este cliente" e, no horário, o
// sistema avisa SÓ ELA (notificação + lista "Retornos"). Nada é enviado ao
// cliente automaticamente — quem escreve é sempre a vendedora. Cada pessoa
// vê e mexe só nos próprios lembretes (admin também).

const MAX_NOTA = 300

// GET /api/reminders → lembretes pendentes (não concluídos) de quem pediu,
// do mais atrasado pro mais distante.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const lembretes = await prisma.contactReminder.findMany({
    where: { userId: auth.id, doneAt: null, contact: { deletedAt: null } },
    orderBy: { dueAt: "asc" },
    take: 300,
    select: {
      id: true, dueAt: true, note: true, createdAt: true,
      contact: { select: { id: true, name: true, empresa: true, assignedUserId: true } },
    },
  })
  return NextResponse.json(lembretes.map((l) => ({
    ...l,
    dueAt: l.dueAt.toISOString(),
    createdAt: l.createdAt.toISOString(),
  })))
}

// POST /api/reminders { contactId, dueAt (ISO), note? }
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let body: { contactId?: string; dueAt?: string; note?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  if (!body.contactId) return NextResponse.json({ error: "Escolha o cliente." }, { status: 400 })
  const dueAt = body.dueAt ? new Date(body.dueAt) : null
  if (!dueAt || Number.isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: "Escolha a data e a hora do retorno." }, { status: 400 })
  }
  // Uma folga de 5 min pra não recusar "agora" por diferença de relógio.
  if (dueAt.getTime() < Date.now() - 5 * 60_000) {
    return NextResponse.json({ error: "Essa data já passou. Escolha um horário daqui pra frente." }, { status: 400 })
  }
  if (dueAt.getTime() > Date.now() + 366 * 86_400_000) {
    return NextResponse.json({ error: "Escolha uma data dentro de 1 ano." }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({
    where: { id: body.contactId },
    select: { id: true, deletedAt: true, assignedUserId: true, lastAgentUserId: true },
  })
  if (!contact || contact.deletedAt) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 })
  // Agente: só cliente da própria carteira (atual ou o último que atendeu).
  if (auth.role === "AGENT" && contact.assignedUserId !== auth.id && contact.lastAgentUserId !== auth.id) {
    return NextResponse.json({ error: "Este cliente não é da sua carteira." }, { status: 403 })
  }

  const criado = await prisma.contactReminder.create({
    data: {
      contactId: contact.id,
      userId: auth.id,
      dueAt,
      note: String(body.note ?? "").trim().slice(0, MAX_NOTA),
    },
    select: { id: true, dueAt: true, note: true },
  })
  return NextResponse.json({ ...criado, dueAt: criado.dueAt.toISOString() }, { status: 201 })
}

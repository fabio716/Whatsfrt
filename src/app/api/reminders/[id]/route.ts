import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// PATCH /api/reminders/[id] { done?: true, dueAt?: ISO } — concluir ou adiar.
// Só a dona do lembrete mexe nele.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const lembrete = await prisma.contactReminder.findUnique({ where: { id }, select: { userId: true } })
  if (!lembrete || lembrete.userId !== auth.id) {
    return NextResponse.json({ error: "Lembrete não encontrado." }, { status: 404 })
  }

  let body: { done?: boolean; dueAt?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const data: { doneAt?: Date; dueAt?: Date; notifiedAt?: null } = {}
  if (body.done === true) data.doneAt = new Date()
  if (body.dueAt) {
    const nova = new Date(body.dueAt)
    if (Number.isNaN(nova.getTime()) || nova.getTime() < Date.now() - 5 * 60_000) {
      return NextResponse.json({ error: "Escolha um horário daqui pra frente." }, { status: 400 })
    }
    data.dueAt = nova
    data.notifiedAt = null // adiado: avisa de novo no novo horário
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada para alterar." }, { status: 400 })

  await prisma.contactReminder.update({ where: { id }, data })
  return NextResponse.json({ ok: true })
}

// DELETE /api/reminders/[id] — apagar (criou por engano).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params
  const r = await prisma.contactReminder.deleteMany({ where: { id, userId: auth.id } })
  if (r.count === 0) return NextResponse.json({ error: "Lembrete não encontrado." }, { status: 404 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

// POST /api/contacts/[id]/request-transfer
//
// "Requisitar cliente" — traz um cliente que está na carteira de outro vendedor
// (ou sem carteira) para a carteira de quem chama, IMEDIATAMENTE e sem aprovação.
// Disponível para qualquer usuário autenticado e a partir de qualquer carteira.
//
// Efeito:
//   - assignedUserId do contato passa a ser o usuário que chamou.
//   - registra o movimento em ContactTransferLog (quem trouxe, de quem, quando).
//
// Observações:
//   - Não mexe em chatStatus nem cria ServiceSession — é uma mudança de
//     titularidade da carteira, não um "assumir atendimento".
//   - Se o cliente já estiver na carteira de quem pede, responde 409 (nada a fazer).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const { id } = await params

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, name: true, assignedUserId: true, deletedAt: true },
  })
  if (!contact || contact.deletedAt) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  }

  if (contact.assignedUserId === session.id) {
    return NextResponse.json({ error: "Este cliente já está na sua carteira" }, { status: 409 })
  }

  // Snapshots dos nomes para o histórico (sobrevivem a rename/desativação).
  const [fromUser, toUser] = await Promise.all([
    contact.assignedUserId
      ? prisma.user.findUnique({ where: { id: contact.assignedUserId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: session.id }, select: { name: true } }),
  ])

  await prisma.$transaction([
    prisma.contact.update({
      where: { id },
      data: { assignedUserId: session.id },
    }),
    prisma.contactTransferLog.create({
      data: {
        contactId: contact.id,
        contactName: contact.name,
        fromUserId: fromUser?.id ?? null,
        fromUserName: fromUser?.name ?? null,
        toUserId: session.id,
        toUserName: toUser?.name ?? "",
      },
    }),
  ])

  return NextResponse.json({
    ok: true,
    contactId: contact.id,
    name: contact.name,
    previousOwner: fromUser?.name ?? null,
  })
}

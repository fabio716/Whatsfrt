import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

// POST /api/contacts/[id]/request-transfer
//
// "Chamar/assumir cliente" — traz um contato para o usuário que chama, na hora.
// Modelo simples de contatos abertos: qualquer agente pode assumir qualquer
// contato (mesmo que esteja com outro agente), sem autorização.
//
// Efeito:
//   - assignedUserId do contato passa a ser o usuário que chamou.
//   - se o contato estava com OUTRO agente, seta historyResetAt=now() → o novo
//     dono começa o chat LIMPO, sem herdar o histórico do agente anterior.
//   - registra o movimento em ContactTransferLog.
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

  // Estava com OUTRO agente? Então é um "takeover" → reseta o histórico pro
  // novo dono começar limpo. Se estava sem dono (fila/livre), NÃO reseta —
  // o agente precisa ver o que o cliente já escreveu.
  const fromAnotherAgent = Boolean(contact.assignedUserId)

  const [fromUser, toUser] = await Promise.all([
    contact.assignedUserId
      ? prisma.user.findUnique({ where: { id: contact.assignedUserId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    prisma.user.findUnique({ where: { id: session.id }, select: { name: true } }),
  ])

  await prisma.$transaction([
    prisma.contact.update({
      where: { id },
      data: {
        assignedUserId: session.id,
        ...(fromAnotherAgent ? { historyResetAt: new Date() } : {}),
      },
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

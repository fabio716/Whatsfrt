import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"

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

  // Cliente JÁ está em atendimento com OUTRO vendedor: não muda na hora — cria
  // uma SOLICITAÇÃO que precisa ser aprovada pelo dono atual OU por um admin.
  // Admin que chama assume direto (supervisão).
  if (contact.assignedUserId && session.role !== "ADMIN") {
    const ownerId = contact.assignedUserId
    const [owner, requester] = await Promise.all([
      prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: session.id }, select: { name: true } }),
    ])

    // Se já existe uma solicitação minha PENDENTE pra esse cliente, não duplica.
    const existing = await prisma.contactTransferRequest.findFirst({
      where: { contactId: contact.id, requesterId: session.id, status: "PENDING" },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { pending: true, alreadyRequested: true, message: "Solicitação já enviada. Aguarde a autorização." },
        { status: 202 },
      )
    }

    const reqRow = await prisma.contactTransferRequest.create({
      data: {
        contactId: contact.id,
        contactName: contact.name,
        fromUserId: ownerId,
        fromUserName: owner?.name ?? "",
        requesterId: session.id,
        requesterName: requester?.name ?? "",
      },
      select: { id: true },
    })

    // Notifica em tempo real o dono atual + todos os admins (podem aprovar).
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    })
    const notify = [...new Set([ownerId, ...admins.map((a) => a.id)])]
    broadcastToUsers(notify, {
      type: "transfer_request",
      data: { id: reqRow.id, contactName: contact.name, requesterName: requester?.name ?? "" },
    })

    return NextResponse.json(
      {
        pending: true,
        message: `Solicitação enviada. Aguarde a autorização de ${owner?.name ?? "quem atende"} ou de um administrador.`,
      },
      { status: 202 },
    )
  }

  // Aqui: cliente sem dono (assumir livre) ou quem chama é ADMIN. Traz na hora.
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

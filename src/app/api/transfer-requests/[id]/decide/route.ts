import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"

// POST /api/transfer-requests/[id]/decide  { action: "approve" | "reject" }
//
// Aprova ou recusa uma solicitação de transferência. Podem decidir:
//   - o DONO atual do cliente (fromUserId), ou
//   - qualquer ADMIN.
// Ao aprovar: o cliente passa para a carteira do solicitante + registra no
// histórico (ContactTransferLog). O solicitante é avisado em tempo real.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const { id } = await params

  let body: { action?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const action = body.action
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
  }

  const req = await prisma.contactTransferRequest.findUnique({ where: { id } })
  if (!req) return NextResponse.json({ error: "Solicitação não encontrada" }, { status: 404 })
  if (req.status !== "PENDING") {
    return NextResponse.json({ error: "Solicitação já foi decidida" }, { status: 409 })
  }

  // Autorização: dono atual OU admin.
  if (me.role !== "ADMIN" && me.id !== req.fromUserId) {
    return NextResponse.json({ error: "Sem permissão para decidir esta solicitação" }, { status: 403 })
  }

  const decider = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true } })
  const deciderName = decider?.name ?? ""

  if (action === "reject") {
    await prisma.contactTransferRequest.update({
      where: { id },
      data: { status: "REJECTED", decidedById: me.id, decidedByName: deciderName, decidedAt: new Date() },
    })
    broadcastToUsers([req.requesterId], {
      type: "transfer_decision",
      data: { contactId: req.contactId, contactName: req.contactName, approved: false, deciderName },
    })
    return NextResponse.json({ ok: true, status: "REJECTED" })
  }

  // approve → transfere o cliente + registra histórico + fecha a solicitação.
  await prisma.$transaction([
    prisma.contact.update({
      where: { id: req.contactId },
      data: { assignedUserId: req.requesterId },
    }),
    prisma.contactTransferLog.create({
      data: {
        contactId: req.contactId,
        contactName: req.contactName,
        fromUserId: req.fromUserId,
        fromUserName: req.fromUserName,
        toUserId: req.requesterId,
        toUserName: req.requesterName,
      },
    }),
    prisma.contactTransferRequest.update({
      where: { id },
      data: { status: "APPROVED", decidedById: me.id, decidedByName: deciderName, decidedAt: new Date() },
    }),
  ])

  broadcastToUsers([req.requesterId], {
    type: "transfer_decision",
    data: { contactId: req.contactId, contactName: req.contactName, approved: true, deciderName },
  })

  return NextResponse.json({ ok: true, status: "APPROVED" })
}

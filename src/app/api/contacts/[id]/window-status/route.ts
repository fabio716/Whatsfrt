import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"
import { requireSession, isErrorResponse } from "@/lib/auth"

// GET /api/contacts/[id]/window-status
//
// Diz se a "janela de 24h" do WhatsApp está aberta para esse contato. O Meta
// considera spam (e dropa silenciosamente) envios de iniciativa do agente
// quando o cliente não respondeu nas últimas 24h. O painel usa isso pra avisar
// o agente antes dele queimar mensagens em vão.
//
// Resposta:
//   windowOpen             — true se houve INBOUND nas últimas 24h
//   lastInboundAt          — quando foi o último inbound (ISO ou null)
//   hoursSinceLastInbound  — horas desde o último inbound (null se nunca)
//   consecutiveOutbound    — OUTBOUND consecutivos desde o último INBOUND
//   hasEverReceivedInbound — se algum inbound já existiu neste contato
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const { id } = await params

  const contact = await prisma.contact.findUnique({
    where: { id, deletedAt: null },
    select: { id: true, assignedUserId: true },
  })
  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  }

  // Agente só pode olhar contatos atribuídos a ele. Admin vê tudo.
  if (session.role === "AGENT" && contact.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const lastInbound = await prisma.message.findFirst({
    where: { contactId: id, direction: MessageDirection.INBOUND },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  })

  const now = Date.now()
  const lastInboundAt = lastInbound?.createdAt ?? null
  const hoursSinceLastInbound = lastInboundAt
    ? (now - lastInboundAt.getTime()) / 3_600_000
    : null
  const windowOpen = hoursSinceLastInbound !== null && hoursSinceLastInbound < 24

  // Conta OUTBOUND desde o último INBOUND (ou desde sempre, se nunca houve).
  const consecutiveOutbound = await prisma.message.count({
    where: {
      contactId: id,
      direction: MessageDirection.OUTBOUND,
      ...(lastInboundAt ? { createdAt: { gt: lastInboundAt } } : {}),
    },
  })

  return NextResponse.json({
    windowOpen,
    lastInboundAt: lastInboundAt?.toISOString() ?? null,
    hoursSinceLastInbound,
    consecutiveOutbound,
    hasEverReceivedInbound: lastInboundAt !== null,
  })
}

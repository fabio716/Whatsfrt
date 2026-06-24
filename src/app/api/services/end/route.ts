import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { endActiveSession, markAwaitingRating } from "@/lib/serviceTracking"
import { sendText as sendWhatsAppText } from "@/lib/whatsapp"
import { broadcast } from "@/lib/sse-emitter"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"

const RATING_REQUEST = `🙏 Obrigado pelo contato! Antes de finalizar, gostaríamos da sua avaliação.

De 1 a 5, como foi o atendimento?

1 - Muito ruim
2 - Ruim
3 - Regular
4 - Bom
5 - Excelente

Responda apenas o número. Se quiser, comente depois da nota (ex: "5 atendimento rápido").`

interface EndBody {
  contactId: string
  skipRating?: boolean
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  let body: EndBody
  try {
    body = (await request.json()) as EndBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const { contactId, skipRating } = body
  if (!contactId) {
    return NextResponse.json({ error: "contactId obrigatório" }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: {
      id: true, whatsappId: true, name: true, profilePhotoUrl: true,
      chatStatus: true, assignedUserId: true,
    },
  })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  // Agente só pode encerrar contato próprio. Admin pode encerrar qualquer um.
  if (session.role === "AGENT" && contact.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }

  // 1 — Encerra a session ativa (set endedAt).
  const { session: ended } = await endActiveSession(contactId, { autoEnded: false })
  if (!ended) {
    return NextResponse.json({ error: "Sem atendimento ativo" }, { status: 400 })
  }

  // 2 — Pula nota se solicitado (botão "Encerrar sem nota") OU se grupo
  // (não faz sentido enviar nota em grupo).
  if (skipRating || contact.whatsappId.endsWith("@g.us")) {
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        chatStatus: "IDLE",
        assignedUserId: null,
        inServiceSince: null,
        waitingAgentSince: null,
      },
    })
    return NextResponse.json({ ok: true, ratingRequested: false })
  }

  // 3 — Pede a nota. Envia via dispatcher (Z-API ou Evolution conforme env).
  // Salva messageId pra status ticks funcionarem.
  const result = await sendWhatsAppText(contact.whatsappId, RATING_REQUEST)
  const saved = await prisma.message.create({
    data: {
      body: RATING_REQUEST,
      direction: MessageDirection.OUTBOUND,
      status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
      contactId,
      agentId: session.id,
      ...(result.messageId ? { whatsappKeyId: result.messageId } : {}),
      ...(result.ok ? {} : { errorMsg: result.errorMsg }),
    },
  })

  await markAwaitingRating(contactId, ended.id)

  broadcast({
    type: "new_message",
    data: {
      id: saved.id, body: saved.body, direction: saved.direction,
      status: saved.status, createdAt: saved.createdAt.toISOString(),
      agentId: saved.agentId, contactId,
      mediaUrl: saved.mediaUrl, mediaType: saved.mediaType,
      contact: {
        id: contact.id, whatsappId: contact.whatsappId,
        name: contact.name, profilePhotoUrl: contact.profilePhotoUrl,
        chatStatus: "AWAITING_RATING",
        assignedUserId: contact.assignedUserId,
      },
    },
  })

  return NextResponse.json({
    ok: true,
    ratingRequested: true,
    sessionId: ended.id,
  })
}

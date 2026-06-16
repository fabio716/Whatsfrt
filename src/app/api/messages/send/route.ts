import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { sendEvolutionTextDetailed } from "@/lib/evolution"

interface SendMessageBody {
  contactId: string
  text: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  // Idempotency-Key (RFC ish). Mesmo clientKey → mesma mensagem.
  // Botão "enviar" clicado N vezes em duplo-clique, retry de rede do client,
  // tudo vira 1 mensagem só.
  const clientKey = request.headers.get("idempotency-key") ?? null

  let body: SendMessageBody
  try {
    body = (await request.json()) as SendMessageBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { contactId, text } = body
  if (!contactId || !text?.trim()) {
    return NextResponse.json({ error: "contactId and text are required" }, { status: 400 })
  }

  // Se já existe Message com este clientKey, devolve a existente (idempotente).
  if (clientKey) {
    const existing = await prisma.message.findUnique({
      where: { clientKey },
      select: { id: true, status: true, contactId: true },
    })
    if (existing) {
      return NextResponse.json({
        id: existing.id, status: existing.status, idempotent: true,
      })
    }
  }

  const contact = await prisma.contact.findUnique({
    where: { id: contactId, deletedAt: null },
  })
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 })
  }

  if (session.role === "AGENT" && contact.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }

  if (contact.whatsappId.includes("@lid")) {
    return NextResponse.json({
      error: "Não é possível enviar mensagens para este contato. O número não é um telefone válido (formato @lid).",
    }, { status: 400 })
  }

  // 1 — Cria PENDING com clientKey (se houver).
  let message
  try {
    message = await prisma.message.create({
      data: {
        body: text.trim(),
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.PENDING,
        contactId,
        agentId: session.id,
        clientKey,
        attempts: 0,
      },
    })
  } catch (err) {
    // Race no idempotency-key: outro request criou no meio.
    if (clientKey && err && typeof err === "object" && "code" in err && err.code === "P2002") {
      const existing = await prisma.message.findUnique({
        where: { clientKey },
        select: { id: true, status: true },
      })
      if (existing) return NextResponse.json({ id: existing.id, status: existing.status, idempotent: true })
    }
    throw err
  }

  // 2 — Dispara para Evolution (retry+backoff incluso).
  const result = await sendEvolutionTextDetailed(contact.whatsappId, text.trim())
  const finalStatus = result.ok ? MessageStatus.SENT : MessageStatus.FAILED

  // 3 — Persiste estado final + telemetria.
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      status: finalStatus,
      attempts: result.attempts,
      errorMsg: result.ok ? null : result.errorMsg,
    },
  })

  // 4 — Notifica clientes via SSE.
  broadcast({
    type: "message_update",
    data: {
      id: updated.id,
      status: updated.status,
      contactId: updated.contactId,
    },
  }, contact.assignedUserId)

  return NextResponse.json({
    id: updated.id,
    status: updated.status,
    attempts: result.attempts,
    error: result.errorMsg,
  }, { status: result.ok ? 200 : 502 })
}

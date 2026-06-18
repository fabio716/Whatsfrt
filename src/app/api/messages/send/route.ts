import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { sendText as sendWhatsAppText } from "@/lib/whatsapp"
import { validatePhoneCached } from "@/lib/whatsappValidation"

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

  // 0.5 — Valida automaticamente que o número está cadastrado no WhatsApp
  // ANTES de criar a Message. Evita que o agente fique esperando entrega
  // que nunca vai chegar. Cache de 7 dias evita custo extra.
  // Grupos e contatos com histórico de inbound recente pulam — assume válidos.
  const isGroup = contact.whatsappId.endsWith("@g.us")
  if (!isGroup) {
    const recentInbound = await prisma.message.count({
      where: {
        contactId,
        direction: MessageDirection.INBOUND,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 dias
      },
    })
    if (recentInbound === 0) {
      const validated = await validatePhoneCached(contact.whatsappId)
      if (validated === false) {
        return NextResponse.json({
          error: "Este número não está cadastrado no WhatsApp. A mensagem não vai chegar — confirme o número com o cliente.",
          code: "INVALID_WHATSAPP_NUMBER",
        }, { status: 422 })
      }
    }
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

  // 2 — Dispara para o provider ativo (Evolution OU Z-API) com retry+backoff.
  const result = await sendWhatsAppText(contact.whatsappId, text.trim())

  // Mensagem de erro mais clara quando Z-API recusa por número inválido
  // (ajuda agentes a entenderem por que "não chegou").
  if (!result.ok && result.errorMsg) {
    const err = result.errorMsg.toLowerCase()
    if (err.includes("not exist") || err.includes("not registered") || err.includes("invalid number")) {
      result.errorMsg = "Número não está cadastrado no WhatsApp"
    } else if (err.includes("blocked") || err.includes("banned")) {
      result.errorMsg = "Número bloqueou ou nos bloqueou no WhatsApp"
    }
  }

  const finalStatus = result.ok ? MessageStatus.SENT : MessageStatus.FAILED

  // 3 — Persiste estado final + telemetria.
  // CRÍTICO: salvar o messageId retornado pelo provedor (Z-API / Evolution) em
  // whatsappKeyId. É por esse ID que os webhooks de status DELIVERED/READ
  // identificam a mensagem original. Sem isso, os ticks ✓✓ azuis nunca
  // aparecem porque o handleMessageStatus não acha o registro.
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      status: finalStatus,
      attempts: result.attempts,
      errorMsg: result.ok ? null : result.errorMsg,
      ...(result.messageId ? { whatsappKeyId: result.messageId } : {}),
    },
  })

  // 4 — Notifica clientes via SSE.
  // 4a — new_message: pro UI do agente exibir o balão verde imediato sem F5.
  broadcast({
    type: "new_message",
    data: {
      id: updated.id,
      body: updated.body,
      direction: updated.direction,
      status: updated.status,
      createdAt: updated.createdAt.toISOString(),
      agentId: session.id,
      contactId: updated.contactId,
      mediaUrl: null,
      mediaType: null,
      contact: {
        id: contact.id,
        whatsappId: contact.whatsappId,
        name: contact.name,
        profilePhotoUrl: contact.profilePhotoUrl,
        chatStatus: contact.chatStatus,
        assignedUserId: contact.assignedUserId,
      },
    },
  })

  // 4b — message_update: pro UI atualizar status (✓ → ✓✓ → ✓✓ azul).
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

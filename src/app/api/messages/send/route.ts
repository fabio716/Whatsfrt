import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ChatStatus, MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { sendText as sendWhatsAppText } from "@/lib/whatsapp"
import { checkTemplateSpam, checkColdOutreach, getDailyMessageCount } from "@/lib/antispam"
import { checkRateLimit } from "@/lib/rateLimit"

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

  // ─── Anti-spam check 0: burst limit por minuto ──────────────────────────
  // Limite diario nao protege contra envio explosivo em um minuto (bot rodando
  // dentro do navegador, por exemplo). 10 msg/minuto/agente eh confortavel pro
  // uso humano e bloqueia automacao agressiva antes do WhatsApp banir o numero.
  const burst = await checkRateLimit(`send-burst:${session.id}`, 10, 60)
  if (!burst.allowed) {
    return NextResponse.json({
      error: `Você enviou ${burst.count} mensagens em menos de 1 minuto. Aguarde ${burst.retryAfterSec}s.`,
      code: "BURST_LIMIT",
      retryAfterSec: burst.retryAfterSec,
    }, { status: 429, headers: { "Retry-After": String(burst.retryAfterSec) } })
  }

  // ─── Anti-spam check 1: limite diário do agente ─────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { dailyMessageLimit: true },
  })
  const limit = user?.dailyMessageLimit ?? 150
  if (limit > 0) {
    const sentToday = await getDailyMessageCount(session.id)
    if (sentToday >= limit) {
      return NextResponse.json({
        error: `Limite diário atingido (${sentToday}/${limit}). Aguarde até amanhã ou peça pro admin aumentar.`,
        code: "DAILY_LIMIT_REACHED",
        sentToday,
        limit,
      }, { status: 429 })
    }
  }

  // ─── Anti-spam check 2: mesma mensagem repetida (template) ──────────────
  // Bypass quando o frontend confirma "envia mesmo assim" via header.
  const confirmTemplate = request.headers.get("x-confirm-template") === "true"
  if (!confirmTemplate) {
    const spam = await checkTemplateSpam(session.id, text)
    if (spam.isSuspicious) {
      return NextResponse.json({
        error: `Você enviou essa MESMA mensagem ${spam.similarCount} vezes em poucas horas. WhatsApp tem alta chance de filtrar como spam. Personalize a mensagem ou aguarde 1-2 horas.`,
        code: "TEMPLATE_SPAM_RISK",
        similarCount: spam.similarCount,
      }, { status: 429 })
    }
  }

  // ─── Anti-spam check 3: cold outreach (cliente nunca respondeu) ─────────
  // Meta dropa silenciosamente quando o agente insiste em contato que nunca
  // interagiu. 3+ mensagens consecutivas sem resposta = bloqueio sugerido.
  // Bypass via header pro agente confirmar "manda mesmo assim".
  const confirmCold = request.headers.get("x-confirm-cold") === "true"
  if (!confirmCold) {
    const cold = await checkColdOutreach(contactId)
    if (cold.isCold) {
      return NextResponse.json({
        error: `Esse cliente NUNCA respondeu e você já mandou ${cold.consecutiveOutbound} mensagens. WhatsApp tem alta chance de NÃO entregar. Tente outro canal (ligação, SMS) ou peça pro cliente mandar "oi" primeiro.`,
        code: "COLD_OUTREACH_RISK",
        consecutiveOutbound: cold.consecutiveOutbound,
      }, { status: 429 })
    }
  }

  // Validação Z-API só pra log/aviso — NUNCA bloqueia o envio. Razão:
  // Z-API trial as vezes retorna falso-negativo (rate limit, timeout,
  // numero internacional, etc.) e bloquear estava impedindo o agente de
  // iniciar conversa com clientes legitimos. Agora a gente tenta sempre,
  // e o status FAILED no proprio Z-API ja avisa se nao chegou.
  // (Mantemos a validacao no /api/contacts pra avisar na hora do cadastro.)

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

  // 3b — Enviar mensagem = estou atendendo. Se o contato estava IDLE (ex:
  // cliente novo que a agente acabou de cadastrar e ainda não respondeu),
  // promove pra IN_SERVICE. Sem isso ele ficava "Inativo" e o painel escondia
  // da lista — a conversa "sumia" da tela da agente mesmo ela tendo enviado.
  let effectiveStatus: ChatStatus = contact.chatStatus
  if (contact.chatStatus === ChatStatus.IDLE && contact.assignedUserId) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: {
        chatStatus: ChatStatus.IN_SERVICE,
        inServiceSince: contact.inServiceSince ?? new Date(),
      },
    })
    effectiveStatus = ChatStatus.IN_SERVICE
  }

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
        chatStatus: effectiveStatus,
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

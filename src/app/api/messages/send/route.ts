import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"
import { requireSession, isErrorResponse } from "@/lib/auth"

interface SendMessageBody {
  contactId: string
  text: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

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

  const contact = await prisma.contact.findUnique({
    where: { id: contactId, deletedAt: null },
  })
  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 })
  }

  // Isolamento: agente só envia para contatos atribuídos a ele. Admin ignora.
  if (session.role === "AGENT" && contact.assignedUserId !== session.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }

  if (contact.whatsappId.includes("@lid")) {
    return NextResponse.json({
      error: "Não é possível enviar mensagens para este contato. O número não é um telefone válido (formato @lid).",
    }, { status: 400 })
  }

  // 1 — Persist message as PENDING immediately (com agentId para auditoria).
  const message = await prisma.message.create({
    data: {
      body: text.trim(),
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.PENDING,
      contactId,
      agentId: session.id,
    },
  })

  // 2 — Dispatch to Evolution API
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  let finalStatus: MessageStatus = MessageStatus.SENT

  if (apiUrl && apiKey && instance) {
    try {
      let number = contact.whatsappId
      if (number.endsWith("@g.us")) {
        // grupo — mantém
      } else if (number.includes("@lid")) {
        number = number.replace(/@lid.*/, "")
      } else {
        number = number.replace("@s.whatsapp.net", "").replace(/@.*/, "")
      }

      const url = `${apiUrl}/message/sendText/${instance}`
      const payload = { number, text: text.trim() }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const respText = await res.text()
        console.error("[OUTBOUND ERROR] Falha Evolution API:", res.status, respText)
        finalStatus = MessageStatus.FAILED
      }
    } catch (err) {
      console.error("[OUTBOUND EXCEPTION]:", err)
      finalStatus = MessageStatus.FAILED
    }
  } else {
    console.error("[OUTBOUND ERROR] Variáveis de ambiente ausentes:", {
      hasApiUrl: !!apiUrl, hasApiKey: !!apiKey, hasInstance: !!instance,
    })
    finalStatus = MessageStatus.FAILED
  }

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { status: finalStatus },
  })

  broadcast({
    type: "message_update",
    data: {
      id: updated.id,
      status: updated.status,
      contactId: updated.contactId,
    },
  }, contact.assignedUserId)

  return NextResponse.json({ id: updated.id, status: updated.status })
}

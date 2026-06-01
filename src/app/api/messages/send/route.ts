import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"

interface SendMessageBody {
  contactId: string
  text: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
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

  // 1 — Persist message as PENDING immediately
  const message = await prisma.message.create({
    data: {
      body: text.trim(),
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.PENDING,
      contactId,
    },
  })

  // 2 — Dispatch to Evolution API
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  let finalStatus: MessageStatus = MessageStatus.SENT

  if (apiUrl && apiKey && instance) {
    try {
      const number = contact.whatsappId.endsWith("@g.us")
        ? contact.whatsappId
        : contact.whatsappId.replace("@s.whatsapp.net", "")

      const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ number, text: text.trim() }),
      })

      if (!res.ok) finalStatus = MessageStatus.FAILED
    } catch {
      finalStatus = MessageStatus.FAILED
    }
  }

  // 3 — Update final status in DB
  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { status: finalStatus },
  })

  // 4 — Broadcast status update to all SSE clients
  broadcast({
    type: "message_update",
    data: {
      id: updated.id,
      status: updated.status,
      contactId: updated.contactId,
    },
  })

  return NextResponse.json({ id: updated.id, status: updated.status })
}

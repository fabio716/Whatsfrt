import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { prisma } from "@/lib/prisma"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"
import { broadcast } from "@/lib/sse-emitter"

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads")

function evolutionMediaType(mimetype: string): string {
  if (mimetype.startsWith("image/")) return "image"
  if (mimetype.startsWith("video/")) return "video"
  if (mimetype.startsWith("audio/")) return "audio"
  return "document"
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const file      = formData.get("file") as File | null
  const contactId = formData.get("contactId") as string | null
  const caption   = (formData.get("caption") as string | null) ?? ""

  if (!file || !contactId) {
    return NextResponse.json({ error: "file e contactId são obrigatórios" }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  if (contact.whatsappId.includes("@lid")) {
    return NextResponse.json({
      error: "Não é possível enviar para este contato. O número não é um telefone válido (formato @lid).",
    }, { status: 400 })
  }

  // ── Save file to public/uploads/ ────────────────────────────────────────────
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const filePath = path.join(UPLOADS_DIR, safeName)
  const mediaUrl = `/uploads/${safeName}`
  const mediaType = file.type || "application/octet-stream"

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.writeFile(filePath, buffer)

  // ── Persist as PENDING before sending ───────────────────────────────────────
  let finalStatus: MessageStatus = MessageStatus.PENDING
  const msg = await prisma.message.create({
    data: {
      body: caption,
      direction: MessageDirection.OUTBOUND,
      status: MessageStatus.PENDING,
      contactId,
      mediaUrl,
      mediaType,
    },
  })

  // ── Send via Evolution API ───────────────────────────────────────────────────
  const apiUrl  = process.env.EVOLUTION_API_URL
  const apiKey  = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  if (apiUrl && apiKey && instance) {
    try {
      const number = contact.whatsappId.endsWith("@g.us")
        ? contact.whatsappId
        : contact.whatsappId.replace(/@.*/, "")

      const res = await fetch(`${apiUrl}/message/sendMedia/${instance}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          number,
          mediatype: evolutionMediaType(mediaType),
          mimetype: mediaType,
          caption,
          media: buffer.toString("base64"),
          fileName: file.name,
        }),
      })
      if (res.ok) {
        finalStatus = MessageStatus.SENT
      } else {
        console.error("[SEND MEDIA ERROR] Falha Evolution API:", res.status, await res.text())
        finalStatus = MessageStatus.FAILED
      }
    } catch (err) {
      console.error("[SEND MEDIA EXCEPTION]:", err)
      finalStatus = MessageStatus.FAILED
    }
  } else {
    console.error("[SEND MEDIA ERROR] Variáveis de ambiente ausentes")
    finalStatus = MessageStatus.FAILED
  }

  // ── Update status ───────────────────────────────────────────────────────────
  await prisma.message.update({ where: { id: msg.id }, data: { status: finalStatus } })

  // ── Broadcast via SSE ───────────────────────────────────────────────────────
  broadcast({
    type: "new_message",
    data: {
      id: msg.id, body: caption, direction: "OUTBOUND",
      status: finalStatus, createdAt: msg.createdAt.toISOString(),
      agentId: null, contactId,
      mediaUrl, mediaType,
      contact: {
        id: contact.id, whatsappId: contact.whatsappId,
        name: contact.name, profilePhotoUrl: contact.profilePhotoUrl,
        chatStatus: contact.chatStatus,
        assignedUserId: contact.assignedUserId,
      },
    },
  })

  return NextResponse.json({ id: msg.id, status: finalStatus, mediaUrl }, { status: 201 })
}

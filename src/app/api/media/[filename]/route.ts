import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionFromRequest } from "@/lib/auth"
import { isSafeFilename, readMediaFile, verifyMediaToken } from "@/lib/mediaStorage"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// Caches curtos pra reduzir cargas repetidas no mesmo chat.
const CLIENT_CACHE_SECONDS = 60

function inferContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  switch (ext) {
    case "jpg":
    case "jpeg": return "image/jpeg"
    case "png": return "image/png"
    case "gif": return "image/gif"
    case "webp": return "image/webp"
    case "mp4": return "video/mp4"
    case "webm": return "video/webm"
    case "mov": return "video/quicktime"
    case "ogg": return "audio/ogg"
    case "mp3": return "audio/mpeg"
    case "m4a": return "audio/mp4"
    case "wav": return "audio/wav"
    case "pdf": return "application/pdf"
    case "csv": return "text/csv"
    case "txt": return "text/plain"
    case "zip": return "application/zip"
    default: return "application/octet-stream"
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
): Promise<Response> {
  const { filename } = await params

  if (!isSafeFilename(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 })
  }

  // ─── Caminho A: URL assinada (Evolution baixando mídia outbound) ─────────
  const token = request.nextUrl.searchParams.get("token")
  const exp = request.nextUrl.searchParams.get("exp")
  const isSignedRequest = Boolean(token && exp)

  let authorized = false

  if (isSignedRequest) {
    authorized = verifyMediaToken(filename, token, exp)
    if (!authorized) {
      return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 403 })
    }
  } else {
    // ─── Caminho B: sessão + ownership ───────────────────────────────────────
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    if (session.role === "ADMIN") {
      authorized = true
    } else {
      // Localiza a mensagem (WhatsApp) que aponta para este arquivo (formato novo
      // /api/media/<f> ou legado /uploads/<f>) e checa o dono do contato.
      const message = await prisma.message.findFirst({
        where: {
          OR: [
            { mediaUrl: `/api/media/${filename}` },
            { mediaUrl: `/uploads/${filename}` },
          ],
        },
        select: {
          contact: { select: { assignedUserId: true } },
        },
      })
      if (message) {
        authorized = message.contact.assignedUserId === session.id
      } else {
        // Mídia do chat interno: autoriza se o usuário é membro da conversa.
        const internal = await prisma.internalMessage.findFirst({
          where: { mediaUrl: `/api/media/${filename}` },
          select: { conversationId: true },
        })
        if (internal) {
          const member = await prisma.internalConversationMember.findFirst({
            where: { conversationId: internal.conversationId, userId: session.id },
            select: { id: true },
          })
          authorized = Boolean(member)
        }
      }
      if (!authorized) {
        return NextResponse.json({ error: "Sem permissão para esta mídia" }, { status: 403 })
      }
    }
  }

  const file = await readMediaFile(filename)
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const contentType = inferContentType(filename)
  // Tokens assinados não devem ser cacheados publicamente (URL contém token).
  // Sessão+ownership: cache privado curto.
  const cacheControl = isSignedRequest
    ? "private, no-store"
    : `private, max-age=${CLIENT_CACHE_SECONDS}`

  return new Response(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(file.data.length),
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  })
}

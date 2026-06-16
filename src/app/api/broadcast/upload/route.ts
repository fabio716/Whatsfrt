import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { getSessionFromRequest } from "@/lib/auth"

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads")

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024
const ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/"]
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
])
const BLOCKED_MIME = new Set(["image/svg+xml", "text/html", "application/xhtml+xml"])

function isMimeAllowed(mime: string): boolean {
  if (BLOCKED_MIME.has(mime)) return false
  if (ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) return true
  return ALLOWED_MIME_EXACT.has(mime)
}

// POST /api/broadcast/upload — store a media file and return its public URL.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Arquivo excede ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` },
      { status: 413 }
    )
  }

  const mediaType = file.type || "application/octet-stream"
  if (!isMimeAllowed(mediaType)) {
    return NextResponse.json({ error: `Tipo de arquivo não permitido: ${mediaType}` }, { status: 415 })
  }

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const bytes = await file.arrayBuffer()

  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOADS_DIR, safeName), Buffer.from(bytes))

  return NextResponse.json({
    mediaUrl: `/uploads/${safeName}`,
    mediaType,
    fileName: file.name,
  }, { status: 201 })
}

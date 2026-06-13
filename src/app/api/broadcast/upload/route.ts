import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { getSessionFromRequest } from "@/lib/auth"

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads")

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

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
  const mediaType = file.type || "application/octet-stream"
  const bytes = await file.arrayBuffer()

  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await fs.writeFile(path.join(UPLOADS_DIR, safeName), Buffer.from(bytes))

  return NextResponse.json({
    mediaUrl: `/uploads/${safeName}`,
    mediaType,
    fileName: file.name,
  }, { status: 201 })
}

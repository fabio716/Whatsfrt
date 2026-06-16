import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth"
import { isMimeAllowed, MAX_UPLOAD_BYTES, saveMediaBuffer } from "@/lib/mediaStorage"

// POST /api/broadcast/upload — armazena uma mídia e retorna a URL privada.
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

  const bytes = await file.arrayBuffer()
  const saved = await saveMediaBuffer(Buffer.from(bytes), mediaType, file.name)

  return NextResponse.json({
    mediaUrl: saved.mediaUrl,
    mediaType,
    fileName: file.name,
  }, { status: 201 })
}

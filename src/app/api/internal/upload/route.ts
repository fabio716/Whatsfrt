import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { isMimeAllowed, MAX_UPLOAD_BYTES, saveMediaBuffer } from "@/lib/mediaStorage"

export const dynamic = "force-dynamic"

// POST /api/internal/upload — armazena uma mídia (imagem, áudio, arquivo) do
// chat interno e retorna a URL privada (/api/media/<filename>). A autorização
// de leitura dessa mídia é feita em /api/media/[filename] (membro da conversa).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    console.error(
      `[internal/upload] falha ao ler formData: content-length=${request.headers.get("content-length")} ` +
      `content-type=${request.headers.get("content-type")} erro=${err instanceof Error ? err.message : String(err)}`,
    )
    return NextResponse.json({ error: "Corpo inválido — upload pode ter sido interrompido (conexão lenta/instável). Tente de novo." }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Arquivo excede ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.` },
      { status: 413 },
    )
  }

  const mediaType = file.type || "application/octet-stream"
  if (!isMimeAllowed(mediaType, file.name)) {
    return NextResponse.json({ error: `Tipo de arquivo não permitido: ${mediaType}` }, { status: 415 })
  }

  const bytes = await file.arrayBuffer()
  const saved = await saveMediaBuffer(Buffer.from(bytes), mediaType, file.name)

  return NextResponse.json({ mediaUrl: saved.mediaUrl, mediaType, fileName: file.name }, { status: 201 })
}

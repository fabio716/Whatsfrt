import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { MAX_UPLOAD_BYTES, saveMediaBuffer } from "@/lib/mediaStorage"

export const dynamic = "force-dynamic"

// POST /api/me/photo — o usuário logado sobe/atualiza a própria foto de perfil.
// Aceita apenas imagem. Salva via media storage e grava em users.photoUrl.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })

  const mediaType = file.type || ""
  if (!mediaType.startsWith("image/")) {
    return NextResponse.json({ error: "Envie uma imagem (JPG, PNG, etc.)" }, { status: 415 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Imagem muito grande" }, { status: 413 })
  }

  const bytes = await file.arrayBuffer()
  const saved = await saveMediaBuffer(Buffer.from(bytes), mediaType, `perfil-${me.id}-${file.name}`)

  await prisma.user.update({ where: { id: me.id }, data: { photoUrl: saved.mediaUrl } })

  return NextResponse.json({ photoUrl: saved.mediaUrl }, { status: 201 })
}

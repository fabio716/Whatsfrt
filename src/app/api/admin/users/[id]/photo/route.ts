import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { MAX_UPLOAD_BYTES, saveMediaBuffer } from "@/lib/mediaStorage"

export const dynamic = "force-dynamic"

// O administrador troca ou remove a foto de perfil de qualquer conta da
// equipe (a própria pessoa também pode, em Perfil). Só mexe em photoUrl.

// POST /api/admin/users/[id]/photo (multipart, campo "file") → troca a foto.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const alvo = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Escolha uma imagem." }, { status: 400 })
  const tipo = file.type || ""
  if (!tipo.startsWith("image/")) {
    return NextResponse.json({ error: "Envie uma imagem (JPG, PNG, etc.)" }, { status: 415 })
  }
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Imagem muito grande" }, { status: 413 })

  const salvo = await saveMediaBuffer(Buffer.from(await file.arrayBuffer()), tipo, `perfil-${id}-${file.name}`)
  await prisma.user.update({ where: { id }, data: { photoUrl: salvo.mediaUrl } })
  return NextResponse.json({ photoUrl: salvo.mediaUrl }, { status: 201 })
}

// DELETE → remove a foto (volta a aparecer a inicial do nome).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const r = await prisma.user.updateMany({ where: { id }, data: { photoUrl: null } })
  if (r.count === 0) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  return NextResponse.json({ photoUrl: null })
}

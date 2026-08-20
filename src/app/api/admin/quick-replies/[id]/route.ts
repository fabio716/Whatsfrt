import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

interface TemplateBody {
  name?: string
  category?: string
  text?: string
  mediaUrl?: string | null
  mediaType?: string | null
  audioUrl?: string | null
  audioType?: string | null
  order?: number
}

// PATCH /api/admin/quick-replies/[id] — edita um template. Admin only.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const existing = await prisma.quickReplyTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 })

  let body: TemplateBody
  try {
    body = (await request.json()) as TemplateBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio" }, { status: 400 })
    data.name = name
  }
  if (body.category !== undefined) data.category = body.category.trim() || "Geral"
  if (body.text !== undefined) data.text = body.text.trim()
  if (body.mediaUrl !== undefined) data.mediaUrl = body.mediaUrl || null
  if (body.mediaType !== undefined) data.mediaType = body.mediaType || null
  if (body.audioUrl !== undefined) data.audioUrl = body.audioUrl || null
  if (body.audioType !== undefined) data.audioType = body.audioType || null
  if (typeof body.order === "number") data.order = body.order

  const updated = await prisma.quickReplyTemplate.update({ where: { id }, data })
  return NextResponse.json(updated)
}

// DELETE /api/admin/quick-replies/[id] — remove um template. Admin only.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const existing = await prisma.quickReplyTemplate.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: "Template não encontrado" }, { status: 404 })

  await prisma.quickReplyTemplate.delete({ where: { id } })
  return new NextResponse(null, { status: 204 })
}

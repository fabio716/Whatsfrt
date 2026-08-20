import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/admin/quick-replies — lista templates ativos, agrupáveis por
// categoria no front. Aberto pra ADMIN e AGENT (biblioteca compartilhada,
// usada no painel de disparo do Chats).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const templates = await prisma.quickReplyTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { order: "asc" }, { name: "asc" }],
  })

  return NextResponse.json(templates)
}

interface TemplateBody {
  name?: string
  category?: string
  text?: string
  mediaUrl?: string | null
  mediaType?: string | null
  audioUrl?: string | null
  audioType?: string | null
}

// POST /api/admin/quick-replies — cria um template. Só admin gerencia.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  let body: TemplateBody
  try {
    body = (await request.json()) as TemplateBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const name = body.name?.trim()
  const text = body.text?.trim() ?? ""
  if (!name) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 })
  if (!text && !body.mediaUrl && !body.audioUrl) {
    return NextResponse.json({ error: "Adicione texto, imagem/vídeo ou áudio" }, { status: 400 })
  }

  const template = await prisma.quickReplyTemplate.create({
    data: {
      name,
      category: body.category?.trim() || "Geral",
      text,
      mediaUrl: body.mediaUrl || null,
      mediaType: body.mediaType || null,
      audioUrl: body.audioUrl || null,
      audioType: body.audioType || null,
    },
  })

  return NextResponse.json(template, { status: 201 })
}

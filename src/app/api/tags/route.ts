import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// ─── Etiquetas de cliente (compartilhadas pela equipe) ───────────────────────
// GET  → lista todas. POST → cria { name, color }.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } })
  return NextResponse.json(tags)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let body: { name?: string; color?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const name = body.name?.trim().slice(0, 40)
  if (!name) return NextResponse.json({ error: "Nome da etiqueta é obrigatório" }, { status: 400 })
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color ?? "") ? (body.color as string) : "#10b981"

  // Nome repetido reaproveita a etiqueta existente (evita duplicata por acento/clique duplo).
  const existing = await prisma.tag.findUnique({ where: { name } })
  if (existing) return NextResponse.json(existing)

  const tag = await prisma.tag.create({ data: { name, color } })
  return NextResponse.json(tag, { status: 201 })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { aiConfigured } from "@/lib/ai"

export const dynamic = "force-dynamic"

// Base de conhecimento do Copiloto — GET lê, PUT salva. Só admin.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const row = await prisma.aiKnowledge.findUnique({ where: { id: "main" } })
  return NextResponse.json({
    content: row?.content ?? "",
    updatedAt: row?.updatedAt ?? null,
    updatedBy: row?.updatedBy ?? null,
    configured: aiConfigured(),
  })
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  let body: { content?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const content = String(body.content ?? "").slice(0, 100_000)
  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: { name: true } })

  const row = await prisma.aiKnowledge.upsert({
    where: { id: "main" },
    create: { id: "main", content, updatedBy: user?.name ?? null },
    update: { content, updatedBy: user?.name ?? null },
  })
  return NextResponse.json({ content: row.content, updatedAt: row.updatedAt })
}

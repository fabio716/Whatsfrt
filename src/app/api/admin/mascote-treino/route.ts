import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { ID_TREINO, MAX_TREINO } from "@/lib/mascoteIA"
import { TREINO_BASE } from "@/lib/mascoteTreinoBase"

export const dynamic = "force-dynamic"

// Treinamento do mascote: texto livre do gestor (tom, assuntos, regras da
// casa, campanhas do mês...). Só administrador.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const r = await prisma.aiKnowledge.findUnique({ where: { id: ID_TREINO }, select: { content: true, updatedAt: true } })
  return NextResponse.json({ content: r?.content ?? "", updatedAt: r?.updatedAt ?? null, max: MAX_TREINO, base: TREINO_BASE })
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const corpo = (await request.json().catch(() => null)) as { content?: unknown } | null
  if (typeof corpo?.content !== "string") return NextResponse.json({ erro: "Texto inválido." }, { status: 400 })
  const content = corpo.content.trim()
  if (content.length > MAX_TREINO) {
    return NextResponse.json({ erro: `Máximo de ${MAX_TREINO} caracteres.` }, { status: 400 })
  }
  await prisma.aiKnowledge.upsert({
    where: { id: ID_TREINO },
    create: { id: ID_TREINO, content, updatedBy: auth.name ?? "admin" },
    update: { content, updatedBy: auth.name ?? "admin" },
  })
  return NextResponse.json({ ok: true })
}

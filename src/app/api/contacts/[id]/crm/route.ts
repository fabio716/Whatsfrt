import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

const TEMPS = ["HOT", "WARM", "COLD"]

// ─── Ficha comercial do contato: etiquetas + notas + termômetro ──────────────
// PATCH { tagIds?, notes?, temperature? } — só envia o que quer mudar.
// AGENT só mexe em contato da própria carteira; ADMIN em qualquer um.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true, assignedUserId: true } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  if (auth.role === "AGENT" && contact.assignedUserId !== auth.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }

  let body: { tagIds?: string[]; notes?: string; temperature?: string | null }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (body.notes !== undefined) data.notes = String(body.notes).slice(0, 5000)
  if (body.temperature !== undefined) {
    data.temperature = body.temperature && TEMPS.includes(body.temperature) ? body.temperature : null
  }
  if (Array.isArray(body.tagIds)) {
    data.tags = { set: body.tagIds.map((tid) => ({ id: tid })) }
  }

  const updated = await prisma.contact.update({
    where: { id },
    data,
    select: {
      id: true, notes: true, temperature: true,
      tags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } },
    },
  })
  return NextResponse.json(updated)
}

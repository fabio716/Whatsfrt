import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// ─── Arquivar conversa (igual WhatsApp, POR USUÁRIO) ─────────────────────────
// POST   → arquiva o chat deste contato só pra quem chamou.
// DELETE → desarquiva.
// Mensagem nova depois do arquivamento faz o chat reaparecer sozinho (a
// listagem compara archivedAt com a última mensagem — sem precisar de job).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const contact = await prisma.contact.findUnique({ where: { id }, select: { id: true } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  await prisma.chatArchive.upsert({
    where: { userId_contactId: { userId: auth.id, contactId: id } },
    create: { userId: auth.id, contactId: id },
    update: { archivedAt: new Date() },
  })
  return NextResponse.json({ archived: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  await prisma.chatArchive.deleteMany({ where: { userId: auth.id, contactId: id } })
  return NextResponse.json({ archived: false })
}

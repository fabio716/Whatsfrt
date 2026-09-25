import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── GET /api/chats/contact/[id] ──────────────────────────────────────────────
// Uma conversa só, com o histórico, no mesmo formato que a tela de Chats
// recebe do servidor. Serve pra encaixar na lista sem recarregar a página —
// é o que faz a conversa transferida aparecer na hora pra nova vendedora.
//
// Mesma regra de visibilidade da tela: AGENT vê o que é dela (agora ou por
// último); ADMIN vê tudo.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const { id } = await params

  const contato = await prisma.contact.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(me.role === "AGENT"
        ? { OR: [{ assignedUserId: me.id }, { lastAgentUserId: me.id }] }
        : {}),
    },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      tags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } },
    },
  })
  if (!contato) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 })

  const arquivada = await prisma.chatArchive.findFirst({
    where: { userId: me.id, contactId: id },
    select: { id: true },
  })

  return NextResponse.json({
    ...contato,
    archived: Boolean(arquivada),
    messages: contato.messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  })
}

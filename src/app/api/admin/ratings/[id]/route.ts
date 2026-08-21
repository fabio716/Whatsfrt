import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

// DELETE /api/admin/ratings/[id] — remove a nota/comentário de uma sessão de
// atendimento (avaliação injusta, erro do cliente, etc). Não apaga o
// atendimento em si (histórico de tempo de espera/duração continua),
// só zera rating/comment/ratedAt — some da lista e sai do cálculo de CSAT.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const session = await prisma.serviceSession.findUnique({ where: { id } })
  if (!session) return NextResponse.json({ error: "Avaliação não encontrada" }, { status: 404 })
  if (session.rating === null) return NextResponse.json({ error: "Essa sessão não tem avaliação" }, { status: 400 })

  await prisma.serviceSession.update({
    where: { id },
    data: { rating: null, comment: null, ratedAt: null },
  })

  return new NextResponse(null, { status: 204 })
}

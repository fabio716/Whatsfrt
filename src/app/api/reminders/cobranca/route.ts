import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { primeiraRespostaHumana } from "@/lib/retornoAtendido"

export const dynamic = "force-dynamic"

// Retornos da própria pessoa que o mascote deve cobrar: vencidos ou a menos de
// 15 min de vencer, ainda não concluídos e que ELA ainda não respondeu no chat.
// Quem já respondeu o cliente não é cobrado (e o mascote comemora).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const agora = Date.now()
  const lembretes = await prisma.contactReminder.findMany({
    where: {
      userId: auth.id, doneAt: null,
      dueAt: { lte: new Date(agora + 15 * 60_000) },
      contact: { deletedAt: null },
    },
    orderBy: { dueAt: "asc" },
    take: 20,
    select: { id: true, dueAt: true, contact: { select: { id: true, name: true } } },
  })
  const respostas = await primeiraRespostaHumana(lembretes.map((l) => l.id))

  return NextResponse.json(
    lembretes
      .filter((l) => !respostas.get(l.id)?.dono)
      .map((l) => ({
        id: l.id,
        contactId: l.contact.id,
        cliente: l.contact.name,
        dueAt: l.dueAt.toISOString(),
        minAtraso: Math.round((agora - l.dueAt.getTime()) / 60_000),
      })),
  )
}

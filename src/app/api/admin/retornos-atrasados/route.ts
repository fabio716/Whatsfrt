import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Retornos do atendente virtual que atrasaram e ainda não foram concluídos
// (a diretoria já foi avisada). Alimenta a faixa vermelha do administrador.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const lista = await prisma.contactReminder.findMany({
    where: {
      doneAt: null,
      escalonadoAt: { not: null, gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      contact: { deletedAt: null },
    },
    orderBy: { dueAt: "asc" },
    take: 20,
    select: {
      id: true, dueAt: true,
      user: { select: { name: true } },
      contact: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json(lista.map((l) => ({
    id: l.id,
    dueAt: l.dueAt.toISOString(),
    vendedora: l.user.name,
    contactId: l.contact.id,
    cliente: l.contact.name,
  })))
}

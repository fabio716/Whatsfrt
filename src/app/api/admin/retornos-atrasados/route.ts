import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Retornos do atendente virtual que atrasaram e ainda não foram concluídos
// (a diretoria já foi avisada). Alimenta a faixa vermelha do administrador.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  // Só os atrasos que escalaram depois do último "ciente" deste administrador.
  const ciencia = await prisma.atendenteCiencia.findUnique({ where: { userId: auth.id } })
  const limite = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  const desde = ciencia?.atrasosCienteAt && ciencia.atrasosCienteAt > limite ? ciencia.atrasosCienteAt : limite

  const lista = await prisma.contactReminder.findMany({
    where: {
      doneAt: null,
      escalonadoAt: { gt: desde },
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

// POST → "ciente": tira a faixa da tela deste administrador. Atraso novo
// (escalado depois deste momento) faz a faixa voltar.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const agora = new Date()
  await prisma.atendenteCiencia.upsert({
    where: { userId: auth.id },
    create: { userId: auth.id, atrasosCienteAt: agora },
    update: { atrasosCienteAt: agora },
  })
  return NextResponse.json({ ok: true })
}

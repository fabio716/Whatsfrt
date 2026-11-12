import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// ─── Ciência obrigatória dos retornos ────────────────────────────────────────
// Retornos deixados pelo atendente virtual nascem "sem ciência". Ao abrir o
// sistema, a vendedora vê a lista e só continua depois de confirmar. O aceite
// fica gravado (cienteAt) com data e hora. Cada pessoa só vê/confirma os seus.

// GET → retornos pendentes (não concluídos) que ainda não tiveram ciência.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const lista = await prisma.contactReminder.findMany({
    where: { userId: auth.id, doneAt: null, cienteAt: null, contact: { deletedAt: null } },
    orderBy: { dueAt: "asc" },
    take: 50,
    select: {
      id: true, dueAt: true, note: true, escalonadoAt: true,
      contact: { select: { id: true, name: true, empresa: true } },
    },
  })
  return NextResponse.json(lista.map((l) => ({ ...l, dueAt: l.dueAt.toISOString(), atrasado: l.escalonadoAt !== null, escalonadoAt: undefined })))
}

// POST { ids: string[] } → "estou ciente" desses retornos.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let body: { ids?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 50) : []
  if (ids.length === 0) return NextResponse.json({ error: "Nada para confirmar." }, { status: 400 })

  const r = await prisma.contactReminder.updateMany({
    where: { id: { in: ids }, userId: auth.id, cienteAt: null },
    data: { cienteAt: new Date() },
  })
  return NextResponse.json({ confirmados: r.count })
}

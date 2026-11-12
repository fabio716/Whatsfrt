import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Resumo para o administrador do que o atendente virtual fez desde o último
// "ciente" dele (se nunca deu, as últimas 24 horas). POST = dar ciente.

const MOSTRAR = 8

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const ciencia = await prisma.atendenteCiencia.findUnique({ where: { userId: auth.id } })
  const desde = ciencia?.cienteAt ?? new Date(Date.now() - 24 * 60 * 60 * 1000)

  const grupos = await prisma.message.groupBy({
    by: ["contactId"],
    where: { viaAtendente: true, direction: "OUTBOUND", createdAt: { gt: desde } },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 200,
  })
  if (grupos.length === 0) return NextResponse.json({ total: 0, respostas: 0, itens: [] })

  const ids = grupos.slice(0, MOSTRAR).map((g) => g.contactId)
  const [contatos, ultimas, retornos] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, assignedUser: { select: { name: true } } },
    }),
    prisma.message.findMany({
      where: { contactId: { in: ids }, direction: "INBOUND", createdAt: { gt: desde } },
      orderBy: { createdAt: "desc" },
      distinct: ["contactId"],
      select: { contactId: true, body: true },
    }),
    prisma.contactReminder.findMany({
      where: { contactId: { in: ids }, doneAt: null, note: { startsWith: "🤖" } },
      select: { contactId: true, dueAt: true, escalonadoAt: true, user: { select: { name: true } } },
    }),
  ])
  const porContato = new Map(contatos.map((c) => [c.id, c]))
  const ultimaPorContato = new Map(ultimas.map((m) => [m.contactId, m.body]))
  const retornoPorContato = new Map(retornos.map((r) => [r.contactId, r]))

  return NextResponse.json({
    total: grupos.length,
    respostas: grupos.reduce((s, g) => s + g._count._all, 0),
    itens: grupos.slice(0, MOSTRAR).map((g) => {
      const c = porContato.get(g.contactId)
      const r = retornoPorContato.get(g.contactId)
      return {
        contactId: g.contactId,
        cliente: c?.name ?? "Cliente",
        respostas: g._count._all,
        perguntou: (ultimaPorContato.get(g.contactId) ?? "").slice(0, 120),
        vendedora: r?.user.name ?? c?.assignedUser?.name ?? null,
        retornoEm: r ? r.dueAt.toISOString() : null,
        atrasado: Boolean(r?.escalonadoAt),
      }
    }),
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const agora = new Date()
  await prisma.atendenteCiencia.upsert({
    where: { userId: auth.id },
    create: { userId: auth.id, cienteAt: agora },
    update: { cienteAt: agora },
  })
  return NextResponse.json({ ok: true })
}

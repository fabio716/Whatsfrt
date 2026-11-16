import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { TOLERANCIA_ESPERA_MS } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// Ocorrências que o gerente virtual abriu para a pessoa e que ela ainda não
// reconheceu. Cliente na fila (sem dono) aparece para todo atendente: quem der
// ciência primeiro tira o aviso dos outros. Administrador não é cobrado aqui.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  if (auth.role === "ADMIN") return NextResponse.json([])

  const lista = await prisma.gerenteOcorrencia.findMany({
    where: { resolvidaEm: null, cienteAt: null, OR: [{ userId: auth.id }, { userId: null }] },
    orderBy: { desde: "asc" }, take: 20,
  })
  if (lista.length === 0) return NextResponse.json([])
  const contatos = await prisma.contact.findMany({
    where: { id: { in: lista.map((o) => o.contactId) } }, select: { id: true, name: true },
  })
  const nome = new Map(contatos.map((c) => [c.id, c.name]))
  const agora = Date.now()
  return NextResponse.json(lista.map((o) => ({
    id: o.id,
    tipo: o.tipo,
    fila: o.userId === null,
    contactId: o.contactId,
    cliente: nome.get(o.contactId) ?? "Cliente",
    desde: o.desde.toISOString(),
    minutos: Math.max(1, Math.round((agora - o.desde.getTime()) / 60_000)),
    toleranciaMin: Math.round(TOLERANCIA_ESPERA_MS / 60_000),
    diretoriaAvisada: o.escaladaEm !== null,
  })))
}

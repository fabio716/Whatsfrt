import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { TOLERANCIA_ESPERA_MS, resolverOcorrencias } from "@/lib/gerenteVirtual"
import { ausenciaDe } from "@/lib/ausencia"

export const dynamic = "force-dynamic"

// Ocorrências do gerente virtual para a pessoa: as dela continuam aqui até ela
// ATENDER o cliente (a tela fica travada, só o chat liberado). Cliente na fila
// (sem dono) aparece para todo atendente só até alguém dar ciência.
// Administrador não é cobrado aqui.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  if (auth.role === "ADMIN") return NextResponse.json([])
  if (await ausenciaDe(auth.id)) return NextResponse.json([]) // ausente: sem aviso nem trava

  // Trava de segurança: depois de ciente, a tela só fica travada por 30 min da cobrança.
  // Passou disso, o caso segue no relatório e com o administrador, mas ela é liberada.
  const trava = new Date(Date.now() - 30 * 60_000)
  const abertas = {
    resolvidaEm: null,
    OR: [{ userId: auth.id, cienteAt: null }, { userId: auth.id, abertaEm: { gte: trava } }, { userId: null, cienteAt: null }],
  }
  // Se ela acabou de responder, libera na hora (sem esperar o ciclo de 20 s).
  if (await prisma.gerenteOcorrencia.count({ where: abertas }) > 0) await resolverOcorrencias()
  const lista = await prisma.gerenteOcorrencia.findMany({ where: abertas, orderBy: { desde: "asc" }, take: 20 })
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
    lembreteId: o.tipo === "RETORNO_ATRASADO" ? o.refId.split(":")[0] : null,
    contactId: o.contactId,
    cliente: nome.get(o.contactId) ?? "Cliente",
    desde: o.desde.toISOString(),
    minutos: Math.max(1, Math.round((agora - o.desde.getTime()) / 60_000)),
    toleranciaMin: Math.round(TOLERANCIA_ESPERA_MS / 60_000),
    ciente: o.cienteAt !== null,
    diretoriaAvisada: o.escaladaEm !== null,
  })))
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { primeiraRespostaHumana, statusRetorno, type StatusRetorno } from "@/lib/retornoAtendido"

export const dynamic = "force-dynamic"

// Painel do administrador: cada agente está respeitando o horário combinado
// nos retornos do atendente virtual (🤖)? Período = retornos com horário
// combinado de N dias atrás (dia de Brasília) em diante, inclusive os que
// ainda vão vencer.

const FUSO_MS = 3 * 60 * 60 * 1000

function inicioDoDiaBr(diasAtras: number): Date {
  const br = new Date(Date.now() - FUSO_MS)
  const meiaNoite = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - diasAtras)
  return new Date(meiaNoite + FUSO_MS)
}

interface Contagem { noPrazo: number; comAtraso: number; semAtendimento: number; aVencer: number; soMarcou: number; outraPessoa: number }
const vazio = (): Contagem => ({ noPrazo: 0, comAtraso: 0, semAtendimento: 0, aVencer: 0, soMarcou: 0, outraPessoa: 0 })

function somar(c: Contagem, s: StatusRetorno): void {
  if (s === "NO_PRAZO") c.noPrazo++
  else if (s === "COM_ATRASO") c.comAtraso++
  else if (s === "SEM_ATENDIMENTO") c.semAtendimento++
  else if (s === "SO_MARCOU") c.soMarcou++
  else if (s === "OUTRA_PESSOA") c.outraPessoa++
  else c.aVencer++
}

// Pontualidade = no prazo / (no prazo + com atraso + sem atendimento).
// "A vencer", "só marcou feito" e "outra pessoa atendeu" ficam de fora: não
// provam nem desmentem que a dona respeitou o horário.
const pontualidade = (c: Contagem): number | null => {
  const base = c.noPrazo + c.comAtraso + c.semAtendimento
  return base === 0 ? null : Math.round((c.noPrazo / base) * 100)
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const diasParam = Number(request.nextUrl.searchParams.get("dias") ?? 7)
  const dias = [1, 7, 30].includes(diasParam) ? diasParam : 7
  const agora = new Date()

  const lembretes = await prisma.contactReminder.findMany({
    where: { note: { startsWith: "🤖" }, dueAt: { gte: inicioDoDiaBr(dias - 1) }, contact: { deletedAt: null } },
    orderBy: { dueAt: "desc" },
    take: 1000,
    select: {
      id: true, userId: true, dueAt: true, doneAt: true,
      user: { select: { name: true, department: true } },
      contact: { select: { id: true, name: true, empresa: true } },
    },
  })
  const respostas = await primeiraRespostaHumana(lembretes.map((l) => l.id))

  const geral = vazio()
  const porAgente = new Map<string, { nome: string; departamento: string | null; c: Contagem; atrasos: number[] }>()
  const itens = lembretes.map((l) => {
    const resp = respostas.get(l.id)
    const donoEm = resp?.dono?.em ?? null
    const outroEm = resp?.outro?.em ?? null
    const { status, atrasoMin } = statusRetorno({ dueAt: l.dueAt, donoEm, marcouEm: l.doneAt, outroEm }, agora)
    const atendidoEm = donoEm ?? l.doneAt ?? outroEm
    const via = donoEm ? "chat" : l.doneAt ? "marcado" : outroEm ? "outra" : null
    // Marcou "Fiz o retorno" bem antes do horário combinado: aviso.
    const antesMin = via === "marcado" && l.doneAt && l.dueAt.getTime() - l.doneAt.getTime() > 15 * 60_000
      ? Math.round((l.dueAt.getTime() - l.doneAt.getTime()) / 60_000) : 0

    somar(geral, status)
    const ag = porAgente.get(l.userId) ?? { nome: l.user.name, departamento: l.user.department, c: vazio(), atrasos: [] }
    somar(ag.c, status)
    if (status === "COM_ATRASO") ag.atrasos.push(atrasoMin)
    porAgente.set(l.userId, ag)

    return {
      id: l.id,
      agenteId: l.userId,
      agente: l.user.name,
      contactId: l.contact.id,
      cliente: l.contact.name,
      empresa: l.contact.empresa,
      combinado: l.dueAt.toISOString(),
      atendidoEm: atendidoEm ? atendidoEm.toISOString() : null,
      via,
      status,
      atrasoMin,
      antesMin,
      por: via === "outra" ? resp?.outro?.por ?? null : null,
      texto: via === "chat" ? resp?.dono?.texto ?? "" : via === "outra" ? resp?.outro?.texto ?? "" : "",
      suspeito: false,
    }
  })

  // Vários retornos "atendidos" pela mesma pessoa em menos de 1 minuto não é
  // atendimento de verdade (cliques em lote, mensagens automáticas...): marca
  // pra o administrador conferir. Janela móvel de 60 s ao redor de cada um.
  const instantes = new Map<string, number[]>()
  for (const i of itens) {
    if (i.atendidoEm) instantes.set(i.agenteId, [...(instantes.get(i.agenteId) ?? []), Date.parse(i.atendidoEm)])
  }
  for (const i of itens) {
    if (!i.atendidoEm) continue
    const t = Date.parse(i.atendidoEm)
    i.suspeito = (instantes.get(i.agenteId) ?? []).filter((x) => Math.abs(x - t) <= 60_000).length >= 3
  }

  const agentes = [...porAgente.entries()].map(([id, a]) => ({
    id,
    nome: a.nome,
    departamento: a.departamento,
    total: a.c.noPrazo + a.c.comAtraso + a.c.semAtendimento + a.c.aVencer + a.c.soMarcou + a.c.outraPessoa,
    ...a.c,
    pontualidade: pontualidade(a.c),
    suspeitos: itens.filter((i) => i.agenteId === id && i.suspeito).length,
    atrasoMedioMin: a.atrasos.length ? Math.round(a.atrasos.reduce((s, x) => s + x, 0) / a.atrasos.length) : null,
  }))
  // Quem precisa de atenção primeiro: mais sem atendimento, depois menor pontualidade.
  agentes.sort((x, y) => y.semAtendimento - x.semAtendimento || (x.pontualidade ?? 101) - (y.pontualidade ?? 101) || x.nome.localeCompare(y.nome))

  return NextResponse.json({
    dias,
    geral: { total: itens.length, ...geral, pontualidade: pontualidade(geral) },
    agentes,
    itens: itens.slice(0, 400),
    truncado: itens.length > 400,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Relatório do gerente virtual: atrasos por pessoa nos últimos N dias (1–30),
// com espera média, quantos ficaram sem ciência e a lista recente.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const dias = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("dias")) || 7))
  const desde = new Date(Date.now() - dias * 86_400_000)

  const ocorrencias = await prisma.gerenteOcorrencia.findMany({
    where: { abertaEm: { gte: desde } }, orderBy: { abertaEm: "desc" }, take: 500,
  })
  const [usuarios, contatos] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(ocorrencias.map((o) => o.userId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, name: true } }),
    prisma.contact.findMany({ where: { id: { in: [...new Set(ocorrencias.map((o) => o.contactId))] } }, select: { id: true, name: true } }),
  ])
  const idsLembrete = ocorrencias.filter((o) => o.tipo === "RETORNO_ATRASADO").map((o) => o.refId.split(":")[0])
  const lembretes = idsLembrete.length
    ? await prisma.contactReminder.findMany({ where: { id: { in: idsLembrete } }, select: { id: true, dueAt: true, createdAt: true, note: true, canal: true, doneAt: true } })
    : []
  const porLembrete = new Map(lembretes.map((l) => [l.id, l]))
  const nomeU = new Map(usuarios.map((u) => [u.id, u.name]))
  const nomeC = new Map(contatos.map((c) => [c.id, c.name]))

  const porPessoa = new Map<string, { nome: string; espera: number; retorno: number; semCiencia: number; somaMin: number; resolvidas: number; abertas: number }>()
  for (const o of ocorrencias) {
    const chave = o.userId ?? "fila"
    const p = porPessoa.get(chave) ?? { nome: o.userId ? (nomeU.get(o.userId) ?? "—") : "Fila (sem dono)", espera: 0, retorno: 0, semCiencia: 0, somaMin: 0, resolvidas: 0, abertas: 0 }
    if (o.tipo === "ESPERA_CLIENTE") p.espera++; else p.retorno++
    if (!o.cienteAt && o.resolvidaEm) p.semCiencia++
    if (o.resolvidaEm) { p.resolvidas++; p.somaMin += o.esperaMin ?? 0 } else p.abertas++
    porPessoa.set(chave, p)
  }
  return NextResponse.json({
    dias,
    resumo: [...porPessoa.values()].map((p) => ({ nome: p.nome, espera: p.espera, retorno: p.retorno, semCiencia: p.semCiencia, abertas: p.abertas, esperaMediaMin: p.resolvidas ? Math.round(p.somaMin / p.resolvidas) : 0 }))
      // Ordem alfabética (não "pior primeiro"): o relatório é para orientar, não para expor ninguém.
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    recentes: ocorrencias.slice(0, 60).map((o) => ({
      id: o.id, tipo: o.tipo, pessoa: o.userId ? (nomeU.get(o.userId) ?? "—") : "Fila (sem dono)",
      cliente: nomeC.get(o.contactId) ?? "Cliente", desde: o.desde.toISOString(), cienteAt: o.cienteAt?.toISOString() ?? null,
      resolvidaEm: o.resolvidaEm?.toISOString() ?? null, esperaMin: o.esperaMin, diretoriaAvisada: o.escaladaEm !== null, contestacao: o.contestacao,
      // Para o admin conferir se o atraso é real: o que foi combinado, quando e por quê.
      lembrete: o.tipo === "RETORNO_ATRASADO" ? (() => { const l = porLembrete.get(o.refId.split(":")[0]); return l ? { combinadoPara: l.dueAt.toISOString(), criadoEm: l.createdAt.toISOString(), nota: l.note, feitoEm: l.doneAt?.toISOString() ?? null } : null })() : null,
    })),
  })
}

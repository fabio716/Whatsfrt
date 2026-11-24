import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Resumo das tarefas para o dashboard do administrador. ?dias=7|30|90 define o
// período das tarefas criadas; as que estão em aberto entram sempre.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const dias = [7, 30, 90].includes(Number(request.nextUrl.searchParams.get("dias"))) ? Number(request.nextUrl.searchParams.get("dias")) : 30
  const agora = Date.now()
  const desde = new Date(agora - dias * 86_400_000)
  const tarefas = await prisma.tarefa.findMany({
    where: { OR: [{ concluidaAt: null }, { createdAt: { gte: desde } }] }, orderBy: { prazoEm: "asc" }, take: 2000,
  })
  const nomes = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(tarefas.map((t) => t.paraUserId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))

  const abertas = tarefas.filter((t) => !t.concluidaAt)
  const atrasadas = abertas.filter((t) => t.prazoEm.getTime() < agora)
  const noPeriodo = tarefas.filter((t) => t.createdAt >= desde)
  const concluidas = noPeriodo.filter((t) => t.concluidaAt)
  const noPrazo = concluidas.filter((t) => (t.concluidaAt as Date).getTime() <= t.prazoEm.getTime())
  const horas = (t: { concluidaAt: Date | null; createdAt: Date }) => ((t.concluidaAt as Date).getTime() - t.createdAt.getTime()) / 3_600_000
  const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)
  const pedidos = noPeriodo.filter((t) => t.propostaStatus)

  const porPessoa = [...new Set(tarefas.map((t) => t.paraUserId))].map((uid) => {
    const dele = tarefas.filter((t) => t.paraUserId === uid)
    const ab = dele.filter((t) => !t.concluidaAt)
    const co = dele.filter((t) => t.concluidaAt && t.createdAt >= desde)
    const np = co.filter((t) => (t.concluidaAt as Date).getTime() <= t.prazoEm.getTime())
    return {
      id: uid, nome: nomes.get(uid) ?? "—",
      abertas: ab.length, atrasadas: ab.filter((t) => t.prazoEm.getTime() < agora).length,
      concluidas: co.length, noPrazo: np.length, foraPrazo: co.length - np.length,
      pctNoPrazo: co.length ? Math.round((np.length / co.length) * 100) : null,
      tempoMedioH: media(co.map(horas)),
      pedidosPrazo: dele.filter((t) => t.propostaStatus && t.createdAt >= desde).length,
    }
  }).sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas || a.nome.localeCompare(b.nome))

  // O que precisa de ação do administrador agora.
  const atencao = [
    ...abertas.filter((t) => t.propostaStatus === "PENDENTE").map((t) => ({ t, motivo: "PEDIDO_DE_PRAZO" as const })),
    ...tarefas.filter((t) => t.concluidaAt && !t.recebidaEm).map((t) => ({ t, motivo: "FEEDBACK_NOVO" as const })),
    ...atrasadas.filter((t) => t.propostaStatus !== "PENDENTE").map((t) => ({ t, motivo: "ATRASADA" as const })),
    ...abertas.filter((t) => !t.cienteAt && !t.propostaStatus && agora - t.createdAt.getTime() > 30 * 60_000 && t.prazoEm.getTime() >= agora).map((t) => ({ t, motivo: "SEM_CIENTE" as const })),
  ].slice(0, 30).map(({ t, motivo }) => ({
    id: t.id, titulo: t.titulo, paraNome: nomes.get(t.paraUserId) ?? "—", prazoEm: t.prazoEm.toISOString(), motivo,
    prazoProposto: t.prazoProposto?.toISOString() ?? null, justificativa: t.justificativa,
  }))

  return NextResponse.json({
    dias, atualizadoEm: new Date().toISOString(),
    totais: {
      abertas: abertas.length, atrasadas: atrasadas.length,
      aguardandoDecisao: abertas.filter((t) => t.propostaStatus === "PENDENTE").length,
      aguardandoRecebimento: tarefas.filter((t) => t.concluidaAt && !t.recebidaEm).length,
      semCiente: abertas.filter((t) => !t.cienteAt && !t.propostaStatus).length,
      criadas: noPeriodo.length, concluidas: concluidas.length, noPrazo: noPrazo.length, foraPrazo: concluidas.length - noPrazo.length,
      pctNoPrazo: concluidas.length ? Math.round((noPrazo.length / concluidas.length) * 100) : null,
      tempoMedioH: media(concluidas.map(horas)),
      pedidosPrazo: pedidos.length, pedidosAprovados: pedidos.filter((t) => t.propostaStatus === "APROVADA").length, pedidosRecusados: pedidos.filter((t) => t.propostaStatus === "RECUSADA").length,
    },
    porPessoa, atencao,
  })
}

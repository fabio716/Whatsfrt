import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { getAtendenteConfig } from "@/lib/atendenteVirtual"
import { idsOnline } from "@/lib/presence"
import { getUraConfigCached } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"

export const dynamic = "force-dynamic"

type Estado = "OK" | "RODANDO" | "ATENCAO" | "CRITICO" | "OCIOSO"
interface Agente {
  id: string; nome: string; icone: string; estado: Estado
  resumo: string; achou: string[]; proximo: string; link: string
}

const min = (ms: number) => Math.max(0, Math.round(ms / 60_000))

// Visão geral dos "agentes" do frtwhats num lugar só: o que cada um achou e o
// próximo passo. Só leitura. Só administrador.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const agora = Date.now()
  const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0)
  const fimDia = new Date(inicioDia.getTime() + 86_400_000)

  const [cfgUra, cfgAv, abertas, hoje, retPend, retAtras, conf, avHoje, avRetornos, fila, emAtendimento, agentes, online] = await Promise.all([
    getUraConfigCached(),
    getAtendenteConfig(),
    prisma.gerenteOcorrencia.findMany({ where: { resolvidaEm: null }, select: { tipo: true, desde: true, cienteAt: true, escaladaEm: true } }),
    prisma.gerenteOcorrencia.findMany({ where: { abertaEm: { gte: inicioDia } }, select: { tipo: true, esperaMin: true, resolvidaEm: true, cienteAt: true } }),
    prisma.contactReminder.count({ where: { doneAt: null, dueAt: { lt: fimDia }, contact: { deletedAt: null } } }),
    prisma.contactReminder.count({ where: { doneAt: null, dueAt: { lt: new Date(agora - 5 * 60_000) }, contact: { deletedAt: null } } }),
    prisma.contactReminder.findMany({ where: { conferencia: "PENDENTE", doneAt: { not: null } }, orderBy: { doneAt: "asc" }, take: 50, select: { doneAt: true } }),
    prisma.message.groupBy({ by: ["contactId"], where: { viaAtendente: true, createdAt: { gte: inicioDia } } }),
    prisma.contactReminder.count({ where: { doneAt: null, note: { startsWith: "🤖" } } }),
    prisma.contact.findMany({ where: { chatStatus: "WAITING_AGENT", deletedAt: null, excludeFromReports: false }, select: { waitingAgentSince: true }, take: 200 }),
    prisma.contact.count({ where: { chatStatus: "IN_SERVICE", deletedAt: null } }),
    prisma.user.count({ where: { role: "AGENT", isActive: true } }),
    idsOnline(),
  ])

  const aberto = !cfgUra.isActive || isBusinessHour(cfgUra) === "OPEN"
  const esperaAbertas = abertas.filter((o) => o.tipo === "ESPERA_CLIENTE")
  const maiorEspera = esperaAbertas.length ? min(agora - Math.min(...esperaAbertas.map((o) => o.desde.getTime()))) : 0
  const esperaHoje = hoje.filter((o) => o.tipo === "ESPERA_CLIENTE")
  const resolvidas = esperaHoje.filter((o) => o.resolvidaEm)
  const media = resolvidas.length ? Math.round(resolvidas.reduce((s, o) => s + (o.esperaMin ?? 0), 0) / resolvidas.length) : 0
  const semCiencia = abertas.filter((o) => !o.cienteAt).length

  const agenteEspera: Agente = {
    id: "espera", nome: "Cliente esperando", icone: "⏱️",
    estado: !aberto ? "OCIOSO" : esperaAbertas.length === 0 ? "OK" : maiorEspera >= 5 ? "CRITICO" : "ATENCAO",
    resumo: !aberto ? "FORA DO HORÁRIO" : esperaAbertas.length === 0 ? "EM DIA" : `${esperaAbertas.length} ESPERANDO`,
    achou: [
      !aberto ? "Fora do horário de atendimento: não cobro ninguém agora." : esperaAbertas.length === 0 ? "Nenhum cliente esperando além da tolerância de 1 min." : `${esperaAbertas.length} cliente(s) esperando; o mais antigo há ${maiorEspera} min.`,
      `Hoje: ${esperaHoje.length} atraso(s) de espera, média de ${media} min até atender.`,
      semCiencia > 0 ? `${semCiencia} alerta(s) ainda sem ciência da equipe.` : "Todos os alertas abertos já têm ciência.",
      `Fila agora: ${fila.length} cliente(s) aguardando atendente.`,
    ],
    proximo: esperaAbertas.length ? "Veja quem está atrasado e cobre ao vivo." : "Nada a fazer: acompanhe o relatório de atrasos.",
    link: "/admin/gerente",
  }

  const atrasadosAbertos = abertas.filter((o) => o.tipo === "RETORNO_ATRASADO").length
  const agenteRetornos: Agente = {
    id: "retornos", nome: "Retornos agendados", icone: "⏰",
    estado: retAtras > 0 ? (atrasadosAbertos > 0 ? "CRITICO" : "ATENCAO") : retPend > 0 ? "RODANDO" : "OK",
    resumo: retAtras > 0 ? `${retAtras} ATRASADO${retAtras > 1 ? "S" : ""}` : retPend > 0 ? `${retPend} PARA HOJE` : "EM DIA",
    achou: [
      `${retPend} retorno(s) para fazer até o fim do dia.`,
      retAtras > 0 ? `${retAtras} já passou(aram) do horário (mais de 5 min).` : "Nenhum retorno atrasado.",
      `Hoje: ${hoje.filter((o) => o.tipo === "RETORNO_ATRASADO").length} alerta(s) de retorno atrasado.`,
    ],
    proximo: retAtras > 0 ? "Cobre os atrasados: o gerente já avisou cada responsável." : "Acompanhe pelo painel de retornos.",
    link: "/admin/retornos",
  }

  const maisAntiga = conf.length ? min(agora - (conf[0].doneAt?.getTime() ?? agora)) : 0
  const agenteConferencia: Agente = {
    id: "conferencia", nome: "Conferência", icone: "✅",
    estado: conf.length === 0 ? "OK" : maisAntiga > 240 ? "ATENCAO" : "RODANDO",
    resumo: conf.length === 0 ? "NADA PENDENTE" : `${conf.length} PARA CONFERIR`,
    achou: [
      conf.length === 0 ? "Nenhum retorno aguardando a sua conferência." : `${conf.length} retorno(s) marcados como feitos esperam você dar Concluído ou Não.`,
      conf.length ? `O mais antigo aguarda há ${maisAntiga >= 60 ? `${Math.floor(maisAntiga / 60)} h` : `${maisAntiga} min`}.` : "Tudo conferido.",
    ],
    proximo: conf.length ? "Abra a conferência e feche como Concluído ou Não concluído." : "Nada a fazer.",
    link: "/admin/gerente",
  }

  const agenteAtendente: Agente = {
    id: "atendente", nome: "Atendente virtual", icone: "🤖",
    estado: !(cfgAv.ativoNoite || cfgAv.ativoAlmoco) ? "OCIOSO" : aberto ? "OCIOSO" : "RODANDO",
    resumo: !(cfgAv.ativoNoite || cfgAv.ativoAlmoco) ? "DESLIGADO" : aberto ? "EM ESPERA" : "ATENDENDO",
    achou: [
      `Hoje respondi ${avHoje.length} cliente(s) fora do horário.`,
      `${avRetornos} retorno(s) deixado(s) por mim aguardando a equipe.`,
      `Noite: ${cfgAv.ativoNoite ? "ligado" : "desligado"} · Almoço: ${cfgAv.ativoAlmoco ? "ligado" : "desligado"}.`,
    ],
    proximo: avRetornos > 0 ? "Garanta que a equipe retorne esses clientes." : "Sem pendências minhas.",
    link: "/admin/copiloto",
  }

  const onlineAgentes = online.size
  const nomesOnline = online.size
    ? (await prisma.user.findMany({ where: { id: { in: [...online] }, isActive: true }, select: { name: true }, take: 12 }))
        .map((u) => u.name.trim().split(/\s+/)[0])
    : []
  const agenteEquipe: Agente = {
    id: "equipe", nome: "Equipe ao vivo", icone: "👥",
    estado: !aberto ? "OCIOSO" : fila.length > 0 && onlineAgentes === 0 ? "CRITICO" : fila.length > 0 ? "ATENCAO" : "OK",
    resumo: !aberto ? "FORA DO HORÁRIO" : `${onlineAgentes} ONLINE`,
    achou: [
      `${onlineAgentes} pessoa(s) online de ${agentes} atendentes ativos.`,
      nomesOnline.length ? `Trabalhando online agora: ${nomesOnline.join(", ")}.` : "Ninguém online agora.",
      `${emAtendimento} cliente(s) em atendimento agora.`,
      fila.length ? `${fila.length} cliente(s) na fila esperando alguém.` : "Fila vazia.",
    ],
    proximo: fila.length && onlineAgentes === 0 ? "Ninguém online com cliente na fila: acione a equipe." : "Acompanhe a equipe ao vivo.",
    link: "/admin/equipe-ao-vivo",
  }

  const lista = [agenteEspera, agenteRetornos, agenteConferencia, agenteAtendente, agenteEquipe]
  const criticos = lista.filter((a) => a.estado === "CRITICO").length
  const atencao = lista.filter((a) => a.estado === "ATENCAO").length
  return NextResponse.json({
    atualizadoEm: new Date().toISOString(),
    orquestrador: {
      estado: criticos ? "CRITICO" : atencao ? "ATENCAO" : "OK",
      resumo: criticos ? `${criticos} CRÍTICO${criticos > 1 ? "S" : ""}` : atencao ? `${atencao} EM ATENÇÃO` : "TUDO EM DIA",
      prioridades: lista.filter((a) => a.estado === "CRITICO" || a.estado === "ATENCAO").map((a) => `${a.icone} ${a.nome}: ${a.proximo}`),
    },
    agentes: lista,
  })
}

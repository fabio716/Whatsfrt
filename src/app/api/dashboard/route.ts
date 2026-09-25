import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { idsOnline } from "@/lib/presence"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── GET /api/dashboard ───────────────────────────────────────────────────────
// Dados dos cartões do painel, JÁ FILTRADOS pela pessoa que está logada:
//
//   AGENT → só o que é dela (a carteira dela, os atendimentos dela, a nota
//           dela). Ninguém vê o desempenho de ninguém.
//   ADMIN → a empresa inteira, mais a quebra por vendedora e a presença.
//
// O /api/admin/home-stats antigo era requireAdmin, então a vendedora abria o
// painel e não via nada. Este substitui aquele.
//
// PESO: roda a cada 60s por aba aberta. Só COUNT/GROUP BY agregados no
// Postgres — nada de trazer linha de mensagem pra memória (uma versão antiga
// daquele endpoint fazia isso e derrubava o banco).

interface PorVendedora {
  id: string
  name: string
  atendimentos: number
}

interface NaEquipe {
  id: string
  name: string
  status: "ATTENDING" | "ONLINE" | "OFFLINE"
  atendendo: number
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const souAgente = me.role === "AGENT"
  // null = empresa inteira (admin). Preenchido = recorte de uma pessoa só.
  const agenteId: string | null = souAgente ? me.id : null

  const agora = new Date()
  const inicioDoDia = new Date(agora)
  inicioDoDia.setHours(0, 0, 0, 0)
  const seteDias = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)

  // "Minha carteira": quem está comigo agora OU quem eu atendi por último.
  // Sem a segunda parte a carteira encolheria a cada atendimento encerrado,
  // porque encerrar devolve o contato ao pool (zera o assignedUserId).
  const daPessoa: Prisma.ContactWhereInput = agenteId
    ? { OR: [{ assignedUserId: agenteId }, { lastAgentUserId: agenteId }] }
    : {}

  const [
    emAtendimento,
    atendimentosHoje,
    csatAgg,
    mensagensRows,
    carteiraRows,
    semRespostaRows,
    filaGeral,
    porVendedoraRows,
    equipe,
  ] = await Promise.all([
    prisma.contact.count({
      where: {
        chatStatus: "IN_SERVICE",
        deletedAt: null,
        ...(agenteId ? { assignedUserId: agenteId } : {}),
      },
    }),
    prisma.serviceSession.count({
      where: {
        startedAt: { gte: inicioDoDia },
        ...(agenteId ? { agentId: agenteId } : {}),
      },
    }),
    prisma.serviceSession.aggregate({
      where: {
        ratedAt: { not: null },
        rating: { not: null },
        endedAt: { gte: seteDias },
        ...(agenteId ? { agentId: agenteId } : {}),
      },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    // Mensagens de hoje por direção e por hora.
    // Recebida "minha" = chegou de um cliente da minha carteira; enviada
    // "minha" = fui eu que mandei (agentId). São critérios diferentes de
    // propósito: mensagem que entra não tem agente.
    prisma.$queryRaw<Array<{ direction: string; hour: number; count: number }>>`
      SELECT m.direction,
             EXTRACT(HOUR FROM m."createdAt")::INT AS hour,
             COUNT(*)::INT AS count
      FROM messages m
      JOIN contacts c ON c.id = m."contactId"
      WHERE m."createdAt" >= ${inicioDoDia}
        AND c."deletedAt" IS NULL
        AND (
          ${agenteId}::text IS NULL
          OR m."agentId" = ${agenteId}
          OR c."assignedUserId" = ${agenteId}
          OR c."lastAgentUserId" = ${agenteId}
        )
      GROUP BY m.direction, hour
    `,
    prisma.contact.groupBy({
      by: ["temperature"],
      where: { deletedAt: null, ...daPessoa },
      _count: { _all: true },
    }),
    // Clientes cuja ÚLTIMA mensagem foi deles — ou seja, a bola está com a
    // gente. Janela de 7 dias pra não varrer a tabela inteira.
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::BIGINT AS count FROM (
        SELECT DISTINCT ON (m."contactId")
               m."contactId",
               m.direction,
               -- A mensagem nossa imediatamente anterior era transmissão?
               -- Se sim, o cliente só respondeu ao comunicado e não está
               -- esperando atendimento — senão uma transmissão pra 200
               -- contatos enchia este número de gente que não pediu nada.
               LAG(m."isBroadcast") OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS antes_transmissao
        FROM messages m
        JOIN contacts c ON c.id = m."contactId"
        WHERE m."createdAt" >= ${seteDias}
          AND c."deletedAt" IS NULL
          AND (
            ${agenteId}::text IS NULL
            OR c."assignedUserId" = ${agenteId}
            OR c."lastAgentUserId" = ${agenteId}
          )
        ORDER BY m."contactId", m."createdAt" DESC
      ) ultimas
      WHERE ultimas.direction = 'INBOUND'
        AND COALESCE(ultimas.antes_transmissao, false) = false
    `,
    // ─── Daqui pra baixo: só admin. O agente recebe 0/vazio. ───
    souAgente
      ? Promise.resolve(0)
      : prisma.contact.count({ where: { chatStatus: "WAITING_AGENT", deletedAt: null } }),
    souAgente
      ? Promise.resolve([] as Array<{ agentId: string; _count: { _all: number } }>)
      : prisma.serviceSession.groupBy({
          by: ["agentId"],
          where: { startedAt: { gte: inicioDoDia } },
          _count: { _all: true },
        }),
    souAgente
      ? Promise.resolve([] as Array<{ id: string; name: string; assignedContacts: { id: string }[] }>)
      : prisma.user.findMany({
          where: { isActive: true, role: "AGENT" },
          select: {
            id: true,
            name: true,
            assignedContacts: {
              where: { chatStatus: "IN_SERVICE", deletedAt: null },
              select: { id: true },
            },
          },
          orderBy: { name: "asc" },
        }),
  ])

  // Mensagens: total por direção + as 24 barras por hora (só as enviadas e
  // recebidas somadas, que é o que o gráfico mostra).
  const porHora = new Array<number>(24).fill(0)
  let enviadas = 0
  let recebidas = 0
  for (const linha of mensagensRows) {
    const n = Number(linha.count)
    if (linha.direction === "OUTBOUND") enviadas += n
    else recebidas += n
    if (linha.hour >= 0 && linha.hour < 24) porHora[linha.hour] += n
  }

  // Termômetro da carteira. `temperature` é null pra quem nunca foi marcado —
  // esses entram como "sem marcação", não como frio, pra não inventar dado.
  let quente = 0
  let morno = 0
  let frio = 0
  let semMarcacao = 0
  for (const linha of carteiraRows) {
    const n = linha._count._all
    if (linha.temperature === "HOT") quente += n
    else if (linha.temperature === "WARM") morno += n
    else if (linha.temperature === "COLD") frio += n
    else semMarcacao += n
  }

  const nomePorId = new Map(equipe.map((u) => [u.id, u.name]))
  const porVendedora: PorVendedora[] = porVendedoraRows
    .map((linha) => ({
      id: linha.agentId,
      name: nomePorId.get(linha.agentId) ?? "—",
      atendimentos: linha._count._all,
    }))
    .sort((a, b) => b.atendimentos - a.atendimentos)

  const online = await idsOnline()
  const naEquipe: NaEquipe[] = equipe.map((u) => {
    const atendendo = u.assignedContacts.length
    // A ORDEM importa: estar online vem primeiro. Antes "tem conversa aberta"
    // já pintava de ATTENDING, então quem estava de folga com conversa da
    // sexta pendente aparecia atendendo — num feriado a equipe inteira ficava
    // verde. Conversa em aberto não é presença; continua no contador.
    const status: NaEquipe["status"] = !online.has(u.id)
      ? "OFFLINE"
      : atendendo > 0
        ? "ATTENDING"
        : "ONLINE"
    return { id: u.id, name: u.name, status, atendendo }
  })

  return NextResponse.json({
    escopo: souAgente ? "AGENT" : "ADMIN",
    nome: me.name,
    atualizadoEm: agora.toISOString(),
    emAtendimento,
    atendimentosHoje,
    csat: {
      media: csatAgg._avg.rating !== null ? +csatAgg._avg.rating.toFixed(1) : null,
      respostas: csatAgg._count.rating,
    },
    mensagens: { enviadas, recebidas, total: enviadas + recebidas, porHora },
    carteira: {
      quente,
      morno,
      frio,
      semMarcacao,
      total: quente + morno + frio + semMarcacao,
    },
    semResposta: Number(semRespostaRows[0]?.count ?? 0),
    filaGeral,
    porVendedora,
    equipe: naEquipe,
  })
}

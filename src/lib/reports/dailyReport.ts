import { prisma } from "@/lib/prisma"

// ═══════════════════════════════════════════════════════════════════════════
// Relatório do dia — atendimento por vendedora.
//
// O dia é o dia do BRASIL, não do servidor (que roda em UTC). O Brasil não
// tem mais horário de verão desde 2019, então -03:00 fixo é correto e evita
// depender de biblioteca de fuso aqui.
//
// Tudo agregado no Postgres: o relatório roda uma vez por dia, mas varre o
// movimento inteiro (400+ mensagens/dia), então nada de trazer linha por
// linha pra memória.
// ═══════════════════════════════════════════════════════════════════════════

/** Resposta considerada "no atendimento". Acima disso entra em `lentas`. */
const LIMITE_RESPOSTA_MIN = 60

export interface LinhaVendedora {
  id: string
  nome: string
  atendimentos: number
  /** Respostas dadas a uma mensagem do cliente (dentro do limite). */
  respostas: number
  mediaSeg: number | null
  medianaSeg: number | null
  /** Respostas que levaram mais de uma hora. */
  lentas: number
  conversas: number
  mensagens: number
  /** Conversas com troca real: pelo menos 2 mensagens de cada lado. */
  comTroca: number
  notas: number
  notaMedia: number | null
  notasBaixas: number
}

export interface RelatorioDiario {
  dia: string
  totais: {
    atendimentos: number
    conversas: number
    mensagens: number
    respostas: number
    mediaSeg: number | null
    lentas: number
    notas: number
    notaMedia: number | null
    notasBaixas: number
  }
  vendedoras: LinhaVendedora[]
}

/** Início (inclusive) e fim (exclusivo) do dia brasileiro, em instante UTC. */
function limitesDoDia(dia: string): { ini: Date; fim: Date } {
  const ini = new Date(`${dia}T00:00:00-03:00`)
  const fim = new Date(ini.getTime() + 24 * 60 * 60 * 1000)
  return { ini, fim }
}

/** Data de hoje no Brasil, no formato YYYY-MM-DD. */
export function hojeNoBrasil(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function gerarRelatorioDiario(dia: string): Promise<RelatorioDiario> {
  const { ini, fim } = limitesDoDia(dia)

  const [atendRows, tempoRows, trocaRows, notaRows, usuarios] = await Promise.all([
    // ── Atendimentos assumidos no dia ──
    prisma.$queryRaw<Array<{ agentId: string; n: number }>>`
      SELECT "agentId", COUNT(*)::INT AS n
      FROM service_sessions
      WHERE "startedAt" >= ${ini} AND "startedAt" < ${fim}
      GROUP BY "agentId"
    `,

    // ── Tempo de resposta ao cliente ──
    // Para cada mensagem NOSSA que vem logo depois de uma do cliente, mede
    // quanto tempo passou. `anterior = INBOUND` garante que só a PRIMEIRA
    // resposta conta — as seguintes, na sequência, não são tempo de espera.
    // A janela começa 12h antes pra conseguir emparelhar a mensagem que o
    // cliente mandou na véspera com a resposta da manhã.
    prisma.$queryRaw<Array<{
      agentId: string
      respostas: number
      media_seg: number | null
      mediana_seg: number | null
      lentas: number
    }>>`
      WITH base AS (
        SELECT m."agentId",
               m.direction,
               m."createdAt",
               LAG(m.direction)    OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS anterior,
               LAG(m."createdAt")  OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS anterior_em
        FROM messages m
        WHERE m."createdAt" >= ${ini} - INTERVAL '12 hours'
          AND m."createdAt" <  ${fim}
      ),
      respostas AS (
        SELECT "agentId",
               EXTRACT(EPOCH FROM ("createdAt" - anterior_em))::DOUBLE PRECISION AS espera
        FROM base
        WHERE direction = 'OUTBOUND'
          AND anterior = 'INBOUND'
          AND "agentId" IS NOT NULL
          AND "createdAt" >= ${ini}
      )
      SELECT "agentId",
             COUNT(*) FILTER (WHERE espera <= ${LIMITE_RESPOSTA_MIN} * 60)::INT AS respostas,
             AVG(espera) FILTER (WHERE espera <= ${LIMITE_RESPOSTA_MIN} * 60)::DOUBLE PRECISION AS media_seg,
             PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY espera)
               FILTER (WHERE espera <= ${LIMITE_RESPOSTA_MIN} * 60)::DOUBLE PRECISION AS mediana_seg,
             COUNT(*) FILTER (WHERE espera > ${LIMITE_RESPOSTA_MIN} * 60)::INT AS lentas
      FROM respostas
      GROUP BY "agentId"
    `,

    // ── Profundidade da conversa ──
    // "Dona da conversa no dia" = quem enviou mensagem nela. Se duas
    // vendedoras falaram com o mesmo cliente, a conversa conta pras duas —
    // de propósito: as duas trabalharam nela.
    prisma.$queryRaw<Array<{
      agentId: string
      conversas: number
      mensagens: number
      com_troca: number
    }>>`
      WITH dia AS (
        SELECT m."contactId", m.direction, m."agentId"
        FROM messages m
        WHERE m."createdAt" >= ${ini} AND m."createdAt" < ${fim}
      ),
      donos AS (
        SELECT DISTINCT "contactId", "agentId"
        FROM dia
        WHERE direction = 'OUTBOUND' AND "agentId" IS NOT NULL
      ),
      contagem AS (
        SELECT "contactId",
               COUNT(*) FILTER (WHERE direction = 'OUTBOUND')::INT AS saiu,
               COUNT(*) FILTER (WHERE direction = 'INBOUND')::INT  AS entrou
        FROM dia
        GROUP BY "contactId"
      )
      SELECT d."agentId",
             COUNT(*)::INT AS conversas,
             SUM(c.saiu + c.entrou)::INT AS mensagens,
             COUNT(*) FILTER (WHERE c.saiu >= 2 AND c.entrou >= 2)::INT AS com_troca
      FROM donos d
      JOIN contagem c ON c."contactId" = d."contactId"
      GROUP BY d."agentId"
    `,

    // ── Avaliações dadas no dia ──
    prisma.$queryRaw<Array<{
      agentId: string
      n: number
      media: number | null
      baixas: number
    }>>`
      SELECT "agentId",
             COUNT(*)::INT AS n,
             AVG(rating)::DOUBLE PRECISION AS media,
             COUNT(*) FILTER (WHERE rating <= 3)::INT AS baixas
      FROM service_sessions
      WHERE "ratedAt" >= ${ini} AND "ratedAt" < ${fim} AND rating IS NOT NULL
      GROUP BY "agentId"
    `,

    prisma.user.findMany({
      where: { role: "AGENT" },
      select: { id: true, name: true },
    }),
  ])

  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name]))
  const porId = new Map<string, LinhaVendedora>()
  const linha = (id: string): LinhaVendedora => {
    const atual = porId.get(id)
    if (atual) return atual
    const nova: LinhaVendedora = {
      id,
      nome: nomePorId.get(id) ?? "(usuário removido)",
      atendimentos: 0,
      respostas: 0,
      mediaSeg: null,
      medianaSeg: null,
      lentas: 0,
      conversas: 0,
      mensagens: 0,
      comTroca: 0,
      notas: 0,
      notaMedia: null,
      notasBaixas: 0,
    }
    porId.set(id, nova)
    return nova
  }

  for (const r of atendRows) linha(r.agentId).atendimentos = Number(r.n)
  for (const r of tempoRows) {
    const l = linha(r.agentId)
    l.respostas = Number(r.respostas)
    l.mediaSeg = r.media_seg === null ? null : Math.round(r.media_seg)
    l.medianaSeg = r.mediana_seg === null ? null : Math.round(r.mediana_seg)
    l.lentas = Number(r.lentas)
  }
  for (const r of trocaRows) {
    const l = linha(r.agentId)
    l.conversas = Number(r.conversas)
    l.mensagens = Number(r.mensagens)
    l.comTroca = Number(r.com_troca)
  }
  for (const r of notaRows) {
    const l = linha(r.agentId)
    l.notas = Number(r.n)
    l.notaMedia = r.media === null ? null : +r.media.toFixed(1)
    l.notasBaixas = Number(r.baixas)
  }

  // Quem não trabalhou no dia fica fora — relatório com dez linhas zeradas
  // não se lê no celular.
  const vendedoras = [...porId.values()]
    .filter((l) => l.atendimentos > 0 || l.conversas > 0 || l.notas > 0)
    .sort((a, b) => b.atendimentos - a.atendimentos || b.conversas - a.conversas)

  // Média da empresa ponderada pelo número de respostas — média de médias
  // daria peso igual a quem deu 3 e a quem deu 200 respostas.
  let somaEspera = 0
  let somaRespostas = 0
  let somaNotas = 0
  let somaNotasQtd = 0
  for (const l of vendedoras) {
    if (l.mediaSeg !== null) {
      somaEspera += l.mediaSeg * l.respostas
      somaRespostas += l.respostas
    }
    if (l.notaMedia !== null) {
      somaNotas += l.notaMedia * l.notas
      somaNotasQtd += l.notas
    }
  }

  return {
    dia,
    totais: {
      atendimentos: vendedoras.reduce((n, l) => n + l.atendimentos, 0),
      conversas: vendedoras.reduce((n, l) => n + l.conversas, 0),
      mensagens: vendedoras.reduce((n, l) => n + l.mensagens, 0),
      respostas: somaRespostas,
      mediaSeg: somaRespostas > 0 ? Math.round(somaEspera / somaRespostas) : null,
      lentas: vendedoras.reduce((n, l) => n + l.lentas, 0),
      notas: somaNotasQtd,
      notaMedia: somaNotasQtd > 0 ? +(somaNotas / somaNotasQtd).toFixed(1) : null,
      notasBaixas: vendedoras.reduce((n, l) => n + l.notasBaixas, 0),
    },
    vendedoras,
  }
}

// ─── Formatação pro WhatsApp ─────────────────────────────────────────────────

function duracao(seg: number | null): string {
  if (seg === null) return "—"
  if (seg < 60) return `${seg}s`
  const min = Math.floor(seg / 60)
  const resto = seg % 60
  if (min < 60) return resto === 0 ? `${min}min` : `${min}min${String(resto).padStart(2, "0")}s`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`
}

function dataBonita(dia: string): string {
  const [a, m, d] = dia.split("-")
  return `${d}/${m}/${a}`
}

export function formatarParaWhatsApp(r: RelatorioDiario): string {
  const t = r.totais
  const linhas: string[] = [`📊 *Relatório do dia ${dataBonita(r.dia)}*`, ""]

  if (r.vendedoras.length === 0) {
    linhas.push("Nenhum atendimento registrado neste dia.")
    return linhas.join("\n")
  }

  linhas.push("*Empresa*")
  linhas.push(`• ${t.atendimentos} atendimentos · ${t.conversas} conversas`)
  linhas.push(`• ${t.mensagens} mensagens trocadas`)
  linhas.push(`• Resposta média: ${duracao(t.mediaSeg)} (${t.respostas} respostas)`)
  if (t.lentas > 0) {
    linhas.push(`• ⚠️ ${t.lentas} ${t.lentas === 1 ? "resposta levou" : "respostas levaram"} mais de 1h`)
  }
  linhas.push(
    t.notas > 0
      ? `• Avaliação: ${t.notaMedia?.toString().replace(".", ",")} de 5 (${t.notas} ${t.notas === 1 ? "nota" : "notas"}${t.notasBaixas > 0 ? `, ${t.notasBaixas} abaixo de 4` : ""})`
      : "• Avaliação: nenhuma nota hoje",
  )
  linhas.push("")
  linhas.push("*Por vendedora*")

  for (const l of r.vendedoras) {
    const troca = l.conversas > 0 ? Math.round((l.comTroca / l.conversas) * 100) : 0
    const porConversa = l.conversas > 0 ? (l.mensagens / l.conversas).toFixed(1).replace(".", ",") : "0"
    linhas.push("")
    linhas.push(`*${l.nome}* — ${l.atendimentos} ${l.atendimentos === 1 ? "atendimento" : "atendimentos"}`)
    linhas.push(`   ${l.conversas} conversas · ${porConversa} msg cada · ${troca}% com troca`)
    linhas.push(
      `   resposta ${duracao(l.mediaSeg)}${l.medianaSeg !== null ? ` (metade em até ${duracao(l.medianaSeg)})` : ""}`,
    )
    if (l.lentas > 0) linhas.push(`   ⚠️ ${l.lentas} acima de 1h`)
    if (l.notas > 0) {
      linhas.push(
        `   nota ${l.notaMedia?.toString().replace(".", ",")} (${l.notas})${l.notasBaixas > 0 ? ` · ${l.notasBaixas} abaixo de 4` : ""}`,
      )
    }
  }

  linhas.push("")
  linhas.push("_\"com troca\" = conversa com pelo menos 2 mensagens de cada lado._")
  linhas.push("_Resposta conta o tempo entre a mensagem do cliente e a primeira resposta; acima de 1h entra como atrasada._")

  return linhas.join("\n")
}

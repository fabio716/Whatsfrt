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

// ─── Períodos ────────────────────────────────────────────────────────────────
// Toda a matemática de calendário é feita em cima da STRING AAAA-MM-DD, em
// UTC, e só no fim virá instante com -03:00. Fazer conta de dia com objeto de
// data em fuso é onde esse tipo de código erra (e já errou aqui: o relatório
// quebrou por causa de um parâmetro sem tipo em aritmética de data).

export type TipoPeriodo = "dia" | "semana" | "mes"

function somaDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Segunda-feira da semana em que cai `dia`. */
function segundaDaSemana(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  // getUTCDay: 0=domingo. Queremos voltar até segunda, então domingo volta 6.
  const recuo = (d.getUTCDay() + 6) % 7
  return somaDias(dia, -recuo)
}

const primeiroDoMes = (dia: string) => `${dia.slice(0, 7)}-01`

export interface Periodo {
  tipo: TipoPeriodo
  /** Primeiro dia do período (AAAA-MM-DD). */
  de: string
  /** Último dia do período, já cortado em hoje. */
  ate: string
  rotulo: string
  ini: Date
  fim: Date
  /** Mesmo tamanho de janela, imediatamente antes. */
  iniAnterior: Date
  fimAnterior: Date
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

/**
 * Resolve o período a partir de uma data de referência.
 *
 * O período anterior tem o MESMO TEMPO DECORRIDO, não o mês/semana cheio.
 * Comparar 1 a 25 de setembro com agosto inteiro diria que setembro caiu,
 * quando na verdade setembro ainda não acabou.
 */
export function resolverPeriodo(tipo: TipoPeriodo, ref: string): Periodo {
  const hoje = hojeNoBrasil()
  let de: string
  let fimExclusivo: string
  let rotulo: string

  if (tipo === "semana") {
    de = segundaDaSemana(ref)
    fimExclusivo = somaDias(de, 7)
    rotulo = `Semana de ${dataCurta(de)} a ${dataCurta(somaDias(de, 6))}`
  } else if (tipo === "mes") {
    de = primeiroDoMes(ref)
    fimExclusivo = somaDias(`${de.slice(0, 7)}-28`, 7).slice(0, 7) + "-01"
    const [ano, mes] = de.split("-")
    rotulo = `${MESES[Number(mes) - 1]} de ${ano}`
  } else {
    de = ref
    fimExclusivo = somaDias(ref, 1)
    rotulo = dataBonita(ref)
  }

  const ini = new Date(`${de}T00:00:00-03:00`)
  const fimCheio = new Date(`${fimExclusivo}T00:00:00-03:00`)
  const agora = new Date()
  // Não contamos o futuro: período em andamento termina agora. E se o período
  // TODO ainda está por vir (alguém pediu a semana que vem), a janela fecha
  // em zero — antes dava duração negativa, e o período anterior terminava
  // antes de começar.
  const fim = fimCheio > agora ? (agora > ini ? agora : ini) : fimCheio
  const decorrido = Math.max(0, fim.getTime() - ini.getTime())

  // Início do período anterior: uma semana antes, um mês antes, um dia antes.
  const deAnterior = tipo === "semana" ? somaDias(de, -7)
    : tipo === "mes" ? mesAnterior(de)
      : somaDias(de, -1)
  const iniAnterior = new Date(`${deAnterior}T00:00:00-03:00`)

  // A janela anterior tem o mesmo tempo decorrido, MAS nunca passa do início
  // da atual. Sem esse corte, março (31 dias) comparava com 31 dias contados
  // de 1º de fevereiro — entrava em março e contava os mesmos dias duas
  // vezes. Com o corte: mês fechado compara com o mês anterior inteiro, e mês
  // em andamento compara com o mesmo número de dias do mês anterior.
  const fimAnteriorBruto = iniAnterior.getTime() + decorrido
  const fimAnterior = new Date(Math.min(fimAnteriorBruto, ini.getTime()))

  // Último dia visível do período, sem cair antes do primeiro.
  const ultimoDia = somaDias(fimExclusivo, -1)
  const ate = ultimoDia > hoje ? (hoje > de ? hoje : de) : ultimoDia

  return { tipo, de, ate, rotulo, ini, fim, iniAnterior, fimAnterior }
}

function mesAnterior(primeiroDia: string): string {
  const d = new Date(`${primeiroDia}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.toISOString().slice(0, 10)
}

const dataCurta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`

/** Relatório de um dia — usado pela mensagem das 18h. */
export async function gerarRelatorioDiario(dia: string): Promise<RelatorioDiario> {
  const { ini, fim } = limitesDoDia(dia)
  return gerarRelatorio(dia, ini, fim)
}

export async function gerarRelatorio(rotuloDia: string, ini: Date, fim: Date): Promise<RelatorioDiario> {
  const dia = rotuloDia

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
               LAG(m."createdAt")  OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS anterior_em,
               -- Duas casas atrás: a mensagem NOSSA que veio antes da do
               -- cliente. Se foi transmissão, o cliente só reagiu ao
               -- comunicado e isso não é tempo de atendimento.
               LAG(m."isBroadcast", 2) OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS antes_era_transmissao
        FROM messages m
        -- O ::timestamp é OBRIGATÓRIO. Sem ele o parâmetro chega sem tipo,
        -- o Postgres resolve "? - INTERVAL" como interval menos interval, o
        -- resultado vira um intervalo e a comparação explode com
        -- "operator does not exist: timestamp without time zone >= interval".
        WHERE m."createdAt" >= ${ini}::timestamp - INTERVAL '12 hours'
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
          AND COALESCE(antes_era_transmissao, false) = false
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

// ─── Quem esperou demais ─────────────────────────────────────────────────────
// O número "4 acima de 1h" mostra que existe problema; esta lista mostra ONDE.
// Sem ela não dá pra corrigir nada — é o caso a caso que permite falar com a
// vendedora sobre um atendimento concreto em vez de um percentual.

export interface RespostaLenta {
  contactId: string
  cliente: string
  agentId: string
  vendedora: string
  /** Quando o cliente escreveu. */
  clienteEm: string
  /** Quando respondemos. Null = ninguém respondeu até agora. */
  respostaEm: string | null
  esperaSeg: number
  /** O que o cliente disse (começo da mensagem). */
  pergunta: string
}

export async function listarRespostasLentas(
  ini: Date,
  fim: Date,
  agentId?: string,
): Promise<RespostaLenta[]> {
  const limiteSeg = LIMITE_RESPOSTA_MIN * 60

  // Duas situações entram na mesma lista, porque pro cliente é a mesma coisa:
  // esperou muito, ou está esperando até agora.
  const linhas = await prisma.$queryRaw<Array<{
    contactId: string
    cliente: string
    agentId: string | null
    clienteEm: Date
    respostaEm: Date | null
    espera_seg: number
    pergunta: string | null
  }>>`
    WITH base AS (
      SELECT m."contactId", m.direction, m."agentId", m."createdAt", m.body,
             LEAD(m.direction)   OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS proxima,
             LEAD(m."createdAt") OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS proxima_em,
             LEAD(m."agentId")   OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS proxima_agente,
             -- A mensagem nossa logo ANTES da do cliente. Transmissão ali
             -- significa que ele só respondeu ao comunicado.
             LAG(m."isBroadcast")     OVER (PARTITION BY m."contactId" ORDER BY m."createdAt") AS anterior_transmissao
      FROM messages m
      WHERE m."createdAt" >= ${ini}::timestamp - INTERVAL '12 hours'
        AND m."createdAt" <  ${fim}
    )
    SELECT b."contactId",
           c.name AS cliente,
           -- Sem resposta ainda: a cobrança é de quem tem o cliente na carteira.
           COALESCE(b.proxima_agente, ct."assignedUserId", ct."lastAgentUserId") AS "agentId",
           b."createdAt" AS "clienteEm",
           CASE WHEN b.proxima = 'OUTBOUND' THEN b.proxima_em END AS "respostaEm",
           EXTRACT(EPOCH FROM (COALESCE(
             CASE WHEN b.proxima = 'OUTBOUND' THEN b.proxima_em END,
             ${fim}::timestamp
           ) - b."createdAt"))::INT AS espera_seg,
           b.body AS pergunta
    FROM base b
    JOIN contacts c  ON c.id = b."contactId"
    JOIN contacts ct ON ct.id = b."contactId"
    WHERE b.direction = 'INBOUND'
      AND b."createdAt" >= ${ini}
      AND c."deletedAt" IS NULL
      -- Resposta a comunicado em massa não é cliente esperando atendimento.
      AND COALESCE(b.anterior_transmissao, false) = false
      -- Ou demorou demais pra responder, ou ninguém respondeu até o fim da janela.
      AND (b.proxima IS DISTINCT FROM 'OUTBOUND'
           OR EXTRACT(EPOCH FROM (b.proxima_em - b."createdAt")) > ${limiteSeg})
      AND EXTRACT(EPOCH FROM (COALESCE(
            CASE WHEN b.proxima = 'OUTBOUND' THEN b.proxima_em END,
            ${fim}::timestamp
          ) - b."createdAt")) > ${limiteSeg}
      AND (${agentId ?? null}::text IS NULL
           OR COALESCE(b.proxima_agente, ct."assignedUserId", ct."lastAgentUserId") = ${agentId ?? null})
    ORDER BY espera_seg DESC
    LIMIT 100
  `

  const nomes = new Map(
    (await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  )

  return linhas.map((l) => ({
    contactId: l.contactId,
    cliente: l.cliente,
    agentId: l.agentId ?? "",
    vendedora: l.agentId ? (nomes.get(l.agentId) ?? "—") : "sem vendedora",
    clienteEm: l.clienteEm.toISOString(),
    respostaEm: l.respostaEm ? l.respostaEm.toISOString() : null,
    esperaSeg: Number(l.espera_seg),
    pergunta: (l.pergunta ?? "").slice(0, 120),
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// Gerente virtual. Acompanha o atendimento no lugar do gestor e cobra a equipe:
//   • CLIENTE ESPERANDO — cliente NA FILA DE ESPERA (sem atendente) que escreveu e
//     nenhuma PESSOA respondeu em 1 minuto (a resposta do atendente virtual/robô não conta);
//   • RETORNO ATRASADO — o horário combinado passou e a dona não respondeu.
// Cada caso vira uma ocorrência: a pessoa precisa dar "ciente" (tela
// bloqueante), a diretoria é avisada se passar de 5 min, e tudo fica
// registrado (quando atrasou, quando deu ciência, quando resolveu).
// Só vale em horário de atendimento. Não envia nada ao cliente.
// ═══════════════════════════════════════════════════════════════════════════
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { sendPushToUsers } from "@/lib/push"
import { getUraConfigCached, type UraConfigFull } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"
import { idsOnline } from "@/lib/presence"
import { PREFIXO_PEDIDO_NOTA, primeiraRespostaHumana } from "@/lib/retornoAtendido"

export const TOLERANCIA_ESPERA_MS = 60_000 // cliente esperando: 1 min
export const TOLERANCIA_RETORNO_MS = 5 * 60_000 // retorno agendado: 5 min depois do horário
export const ESCALA_DIRETORIA_MS = 5 * 60_000 // quanto tempo sem atendimento avisa a diretoria
const JANELA_MS = 12 * 60 * 60_000
const CHECK_MS = 20_000

export type TipoOcorrencia = "ESPERA_CLIENTE" | "RETORNO_ATRASADO"

let timer: ReturnType<typeof setInterval> | null = null
let rodando = false

const minutos = (ms: number) => Math.max(1, Math.round(ms / 60_000))
const horaBr = (d: Date) => d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "equipe"

// Desde quando o atendimento está aberto agora (abertura do dia ou volta do
// almoço). Cliente que escreveu de madrugada ou no almoço só começa a "esperar"
// quando a equipe volta — ninguém é cobrado por horário fechado.
function inicioDoExpediente(cfg: UraConfigFull): number {
  const bh = cfg.businessHours
  if (!bh?.length) return Date.now() - JANELA_MS
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const dia = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date())
  const dow = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[dia] ?? 1
  const d = bh.find((b) => b.dayOfWeek === dow)
  if (!d) return Date.now()
  const agoraBr = new Date().toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
  const noAlmocoVolta = d.hasLunchBreak && agoraBr >= d.lunchEnd
  const hhmm = (noAlmocoVolta ? d.lunchEnd : d.openTime).slice(0, 5)
  const t = new Date(`${hoje}T${hhmm}:00-03:00`).getTime()
  return Number.isNaN(t) ? Date.now() : t
}

interface LinhaEspera { contactId: string; userId: string | null; nome: string; refId: string; desde: Date }

// Clientes cujas mensagens ainda não tiveram resposta de uma PESSOA.
async function clientesSemResposta(desdeMin: Date): Promise<LinhaEspera[]> {
  return prisma.$queryRaw<LinhaEspera[]>(Prisma.sql`
    WITH humana AS (
      SELECT "contactId", MAX("createdAt") AS em FROM messages
      WHERE direction = 'OUTBOUND' AND "agentId" IS NOT NULL AND "isBroadcast" = false
        AND "viaAtendente" = false AND body NOT LIKE ${PREFIXO_PEDIDO_NOTA + "%"}
        AND "createdAt" > ${new Date(Date.now() - JANELA_MS)}
      GROUP BY "contactId"
    )
    SELECT c.id AS "contactId", c."assignedUserId" AS "userId", c.name AS nome,
           (array_agg(m.id ORDER BY m."createdAt"))[1] AS "refId", MIN(m."createdAt") AS desde
    FROM contacts c
    JOIN messages m ON m."contactId" = c.id AND m.direction = 'INBOUND' AND m."isBroadcast" = false
      AND m."createdAt" > ${new Date(Date.now() - JANELA_MS)}
      -- Mensagem já coberta por um retorno agendado (o cliente foi atendido pelo robô e
      -- ficou combinado um horário) não é "esperando": quem cobra é o retorno, na hora marcada.
      AND NOT EXISTS (
        SELECT 1 FROM contact_reminders r
        WHERE r."contactId" = c.id AND r."doneAt" IS NULL AND r."createdAt" >= m."createdAt"
      )
      AND m.body !~* '^\\s*(ok|okay|obrigad[oa]|obg|valeu|blz|beleza|certo|combinado|👍|🙏)[\\s.!]*$'
    LEFT JOIN humana h ON h."contactId" = c.id
    WHERE c."chatStatus" = 'WAITING_AGENT' AND c."deletedAt" IS NULL
      AND c."excludeFromReports" = false AND (h.em IS NULL OR m."createdAt" > h.em)
    GROUP BY c.id
    HAVING GREATEST(MIN(m."createdAt"), ${desdeMin}) <= ${new Date(Date.now() - TOLERANCIA_ESPERA_MS)}`)
}

async function abrirOcorrencias(cfg: UraConfigFull): Promise<void> {
  const inicio = new Date(inicioDoExpediente(cfg))
  const agora = new Date()
  const novas: { tipo: TipoOcorrencia; refId: string; userId: string | null; contactId: string; nome: string; desde: Date }[] = []

  for (const e of await clientesSemResposta(inicio)) {
    novas.push({ tipo: "ESPERA_CLIENTE", refId: e.refId, userId: e.userId, contactId: e.contactId, nome: e.nome, desde: new Date(Math.max(e.desde.getTime(), inicio.getTime())) })
  }

  // Retornos agendados que passaram do horário (+ tolerância) sem a dona responder.
  const atrasados = await prisma.contactReminder.findMany({
    where: {
      doneAt: null, contact: { deletedAt: null },
      dueAt: { lte: new Date(agora.getTime() - TOLERANCIA_RETORNO_MS), gte: new Date(agora.getTime() - 24 * 60 * 60_000) },
    },
    take: 100, orderBy: { dueAt: "asc" },
    select: { id: true, userId: true, dueAt: true, contact: { select: { id: true, name: true } } },
  })
  if (atrasados.length) {
    const respostas = await primeiraRespostaHumana(atrasados.map((a) => a.id))
    for (const a of atrasados) {
      if (respostas.get(a.id)?.dono) continue
      novas.push({ tipo: "RETORNO_ATRASADO", refId: `${a.id}:${a.dueAt.getTime()}`, userId: a.userId, contactId: a.contact.id, nome: a.contact.name, desde: new Date(Math.max(a.dueAt.getTime(), inicio.getTime())) })
    }
  }
  if (novas.length === 0) return

  const existentes = await prisma.gerenteOcorrencia.findMany({
    where: { OR: novas.map((n) => ({ tipo: n.tipo, refId: n.refId })) },
    select: { tipo: true, refId: true },
  })
  const jaTem = new Set(existentes.map((x) => `${x.tipo}:${x.refId}`))
  for (const n of novas) {
    if (jaTem.has(`${n.tipo}:${n.refId}`)) continue
    try {
      await prisma.gerenteOcorrencia.create({
        data: { tipo: n.tipo, refId: n.refId, userId: n.userId, contactId: n.contactId, desde: n.desde, abertaEm: agora },
      })
    } catch { continue } // outro ciclo criou ao mesmo tempo
    await avisarPessoa(n.tipo, n.userId, n.contactId, n.nome, n.desde)
  }
}

async function avisarPessoa(tipo: TipoOcorrencia, userId: string | null, contactId: string, nome: string, desde: Date): Promise<void> {
  const alvo = userId ? [userId] : [...(await idsOnline())]
  if (alvo.length === 0) return
  const espera = tipo === "ESPERA_CLIENTE"
  await sendPushToUsers(alvo, {
    title: espera ? `⏱️ Cliente esperando: ${nome}` : `⏰ Retorno atrasado: ${nome}`,
    body: espera
      ? `Há ${minutos(Date.now() - desde.getTime())} min sem atendimento (nossa tolerância é 1 min). Atenda agora.`
      : `Combinado para ${horaBr(desde)} e ainda sem retorno. Faça agora.`,
    tag: `gerente-${tipo}-${contactId}`,
    url: `/admin/chats?contact=${contactId}`,
  }).catch((e: unknown) => console.error("[gerente] push falhou:", e instanceof Error ? e.message : e))
}

// Fecha as ocorrências que já foram atendidas (ou perderam o sentido).
async function resolverOcorrencias(): Promise<void> {
  const abertas = await prisma.gerenteOcorrencia.findMany({
    where: { resolvidaEm: null }, take: 300, orderBy: { abertaEm: "asc" },
  })
  if (abertas.length === 0) return
  const agora = Date.now()
  const contatos = await prisma.contact.findMany({
    where: { id: { in: [...new Set(abertas.map((a) => a.contactId))] } },
    select: { id: true, chatStatus: true, deletedAt: true },
  })
  const porId = new Map(contatos.map((c) => [c.id, c]))

  const respostas = await prisma.message.findMany({
    where: {
      contactId: { in: [...porId.keys()] }, direction: "OUTBOUND", agentId: { not: null },
      isBroadcast: false, viaAtendente: false, NOT: { body: { startsWith: PREFIXO_PEDIDO_NOTA } },
      createdAt: { gt: new Date(Math.min(...abertas.map((a) => a.desde.getTime()))) },
    },
    orderBy: { createdAt: "asc" }, take: 3000,
    select: { contactId: true, agentId: true, createdAt: true },
  })
  // Espera cujo cliente tem retorno agendado criado depois da mensagem: passa a ser retorno.
  const esperas = abertas.filter((a) => a.tipo === "ESPERA_CLIENTE")
  const mensagensEspera = esperas.length
    ? new Map((await prisma.message.findMany({ where: { id: { in: esperas.map((e) => e.refId) } }, select: { id: true, createdAt: true } })).map((m) => [m.id, m.createdAt]))
    : new Map<string, Date>()
  const retornosAbertos = esperas.length
    ? await prisma.contactReminder.findMany({ where: { contactId: { in: [...new Set(esperas.map((e) => e.contactId))] }, doneAt: null }, select: { contactId: true, createdAt: true } })
    : []
  const lembretes = abertas.filter((a) => a.tipo === "RETORNO_ATRASADO").map((a) => a.refId.split(":")[0])
  const feitos = new Map((await prisma.contactReminder.findMany({
    where: { id: { in: lembretes } }, select: { id: true, doneAt: true },
  })).map((r) => [r.id, r.doneAt]))

  for (const o of abertas) {
    const resp = respostas.find((r) => r.contactId === o.contactId && r.createdAt > o.desde)
    const c = porId.get(o.contactId)
    let fim: Date | null = null
    let por: string | null = null
    if (resp) { fim = resp.createdAt; por = resp.agentId }
    else if (o.tipo === "ESPERA_CLIENTE" && retornosAbertos.some((r) => r.contactId === o.contactId && r.createdAt >= (mensagensEspera.get(o.refId) ?? o.desde))) fim = new Date()
    else if (o.tipo === "RETORNO_ATRASADO" && feitos.get(o.refId.split(":")[0])) fim = feitos.get(o.refId.split(":")[0]) ?? null
    else if (!c || c.deletedAt || (o.tipo === "ESPERA_CLIENTE" && c.chatStatus !== "WAITING_AGENT")) fim = new Date()
    else if (agora - o.abertaEm.getTime() > 24 * 60 * 60_000) fim = new Date()
    if (!fim) continue
    await prisma.gerenteOcorrencia.updateMany({
      where: { id: o.id, resolvidaEm: null },
      data: { resolvidaEm: fim, resolvidaPorId: por, esperaMin: Math.max(0, Math.round((fim.getTime() - o.desde.getTime()) / 60_000)) },
    })
  }
}

// Passou de 5 min sem atendimento → avisa a diretoria (uma vez por ocorrência).
async function avisarDiretoria(): Promise<void> {
  const limite = new Date(Date.now() - ESCALA_DIRETORIA_MS)
  const pendentes = await prisma.gerenteOcorrencia.findMany({
    where: {
      resolvidaEm: null, escaladaEm: null,
      // Cliente: 5 min desde que começou a esperar. Retorno: 5 min depois do alerta à pessoa.
      OR: [{ tipo: "ESPERA_CLIENTE", desde: { lte: limite } }, { tipo: "RETORNO_ATRASADO", abertaEm: { lte: limite } }],
    },
    take: 50,
  })
  if (pendentes.length === 0) return
  const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
  const ids = [...new Set([...pendentes.map((p) => p.userId).filter((x): x is string => Boolean(x)), ...pendentes.map((p) => p.contactId)])]
  const [usuarios, contatos] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ])
  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.name]))
  const nomeContato = new Map(contatos.map((c) => [c.id, c.name]))
  for (const o of pendentes) {
    const marcou = await prisma.gerenteOcorrencia.updateMany({ where: { id: o.id, escaladaEm: null, resolvidaEm: null }, data: { escaladaEm: new Date() } })
    if (marcou.count === 0) continue
    const quem = o.userId ? primeiroNome(nomeUsuario.get(o.userId)) : "Fila (sem dono)"
    const cliente = nomeContato.get(o.contactId) ?? "cliente"
    const min = minutos(Date.now() - o.desde.getTime())
    sendPushToUsers(admins, {
      title: o.tipo === "ESPERA_CLIENTE" ? `⚠️ ${quem}: cliente esperando ${min} min` : `⚠️ ${quem}: retorno atrasado ${min} min`,
      body: o.tipo === "ESPERA_CLIENTE" ? `${cliente} está sem atendimento.` : `${cliente} esperava o retorno às ${horaBr(o.desde)}.`,
      tag: `gerente-adm-${o.id}`, url: `/admin/chats?contact=${o.contactId}`,
    }).catch((e: unknown) => console.error("[gerente] push diretoria falhou:", e instanceof Error ? e.message : e))
  }
}

export async function verificarGerente(): Promise<void> {
  if (rodando) return
  rodando = true
  try {
    await resolverOcorrencias() // sempre: quem atendeu fora do horário também fecha
    const cfg = await getUraConfigCached()
    if (cfg.isActive && isBusinessHour(cfg) !== "OPEN") return
    await abrirOcorrencias(cfg)
    await avisarDiretoria()
  } catch (err) {
    console.error("[gerente] ciclo falhou:", err instanceof Error ? err.message : err)
  } finally {
    rodando = false
  }
}

export function startGerenteVirtual(): void {
  if (timer) return
  timer = setInterval(() => { void verificarGerente() }, CHECK_MS)
  console.log("[gerente] gerente virtual ativo (a cada 20s)")
}

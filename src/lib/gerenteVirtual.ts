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
import { broadcastToUsers } from "@/lib/sse-emitter"
import { acharOuCriarDM } from "@/lib/internalChat"
import { getUraConfigCached, type UraConfigFull } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"
import { idsOnline } from "@/lib/presence"
import { PREFIXO_PEDIDO_NOTA, primeiraRespostaHumana } from "@/lib/retornoAtendido"
import { redis } from "@/lib/redis"
import { parecerDoRetorno, type Parecer } from "@/lib/gerenteParecer"

export const TOLERANCIA_ESPERA_MS = 60_000 // cliente esperando: 1 min
export const TOLERANCIA_RETORNO_MS = 5 * 60_000 // retorno agendado: 5 min depois do horário
export const ESCALA_DIRETORIA_MS = 5 * 60_000 // depois de COBRAR, quanto tempo sem atender até enviar ao admin
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
export async function resolverOcorrencias(): Promise<void> {
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

// Remetente das mensagens internas do gerente. Conta de sistema: inativa (não
// entra no login nem nas listas de equipe), só existe para assinar a mensagem.
export const ID_GERENTE = "gerente-virtual-sistema"
async function usuarioGerente(): Promise<string> {
  await prisma.user.upsert({
    where: { id: ID_GERENTE },
    update: {},
    create: { id: ID_GERENTE, name: "Gerente virtual", email: "gerente-virtual@sistema.interno", passwordHash: "!sem-login", role: "AGENT", isActive: false } as never,
  })
  return ID_GERENTE
}

// Manda uma mensagem do gerente virtual para cada administrador (chat interno).
async function mensagemAosAdmins(adminIds: string[], corpo: string): Promise<void> {
  try {
    const remetente = await usuarioGerente()
    for (const adminId of adminIds) {
      const conversaId = await acharOuCriarDM(remetente, adminId)
      if (!conversaId) continue
      const msg = await prisma.internalMessage.create({ data: { conversationId: conversaId, senderId: remetente, body: corpo } })
      await prisma.internalConversation.update({ where: { id: conversaId }, data: { updatedAt: new Date() } })
      broadcastToUsers([adminId], {
        type: "internal_message",
        data: { id: msg.id, conversationId: conversaId, senderId: remetente, senderName: "Gerente virtual", body: corpo, mediaUrl: null, mediaType: null, createdAt: msg.createdAt.toISOString() },
      })
    }
  } catch (err) {
    console.error("[gerente] mensagem interna falhou:", err instanceof Error ? err.message : err)
  }
}

// Cobrou e a pessoa continua sem atender depois de 5 min → manda ao admin
// (chat interno + notificação) e avisa a própria pessoa de que foi enviado.
async function avisarDiretoria(): Promise<void> {
  const limite = new Date(Date.now() - ESCALA_DIRETORIA_MS)
  const pendentes = await prisma.gerenteOcorrencia.findMany({
    where: { resolvidaEm: null, escaladaEm: null, abertaEm: { lte: limite } }, take: 50,
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
    const motivo = o.tipo === "ESPERA_CLIENTE"
      ? `${cliente} está há ${min} min sem atendimento`
      : `o retorno de ${cliente} (combinado para ${horaBr(o.desde)}) está atrasado há ${min} min`
    await mensagemAosAdmins(admins, `⚠️ Gerente virtual: cobrei ${quem}, mas ${motivo}. Ela(e) já foi avisada(o) e não atendeu. Abra a conversa: /admin/chats?contact=${o.contactId}`)
    sendPushToUsers(admins, {
      title: `⚠️ ${quem} não atendeu depois da cobrança`, body: `${cliente}: ${motivo}.`,
      tag: `gerente-adm-${o.id}`, url: `/admin/chats?contact=${o.contactId}`,
    }).catch((e: unknown) => console.error("[gerente] push diretoria falhou:", e instanceof Error ? e.message : e))
    if (o.userId) {
      sendPushToUsers([o.userId], {
        title: "📨 Enviado ao administrador", body: `${cliente} continua sem atendimento: o administrador foi avisado. Atenda agora.`,
        tag: `gerente-pessoa-${o.id}`, url: `/admin/chats?contact=${o.contactId}`,
      }).catch((e: unknown) => console.error("[gerente] push pessoa falhou:", e instanceof Error ? e.message : e))
    }
  }
}

// ─── Conferência automática dos retornos ────────────────────────────────────
// Retorno marcado como feito (com canal + relato) é conferido sozinho pelo
// gerente: certo → CONCLUÍDO; faltando algo → reabre com "o que falta" e avisa
// a pessoa. Salvaguardas: espera 1 min após marcar; só 2 reprovações automáticas
// por retorno (na 3ª vai para o administrador); se a IA falhar, tenta de novo
// em 10 min e nunca decide no escuro.
const ESPERA_CONFERIR_MS = 60_000
const REABRIR_EM_MS = 30 * 60_000
const MAX_REPROVACOES_AUTO = 2
type Decisor = (id: string, opcoes?: { feitoEm?: Date }) => Promise<Parecer | "SEM_IA" | null>
const ACOMPANHAR_EM_MS = 3 * 60 * 60_000 // quando o cliente não respondeu: novo retorno em 3 h úteis

// Próximo instante dentro do horário de atendimento, a partir de `alvo`.
export function proximoHorarioUtil(cfg: UraConfigFull, alvo: Date): Date {
  const bh = cfg.businessHours
  if (!bh?.length) return alvo
  const minutosDe = (hhmm: string) => { const [h = "0", m = "0"] = hhmm.split(":"); return parseInt(h, 10) * 60 + parseInt(m, 10) }
  const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  for (let i = 0; i < 9; i++) {
    const ref = new Date(alvo.getTime() + i * 86_400_000)
    const data = ref.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    const dow = DOW[new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(ref)] ?? 1
    const d = bh.find((b) => b.dayOfWeek === dow)
    if (!d || d.isClosed) continue
    const abre = minutosDe(d.openTime), fecha = minutosDe(d.closeTime)
    const almoco = d.hasLunchBreak ? [minutosDe(d.lunchStart), minutosDe(d.lunchEnd)] : null
    const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`
    let cand = i === 0 ? minutosDe(alvo.toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })) : abre
    if (cand < abre) cand = abre
    if (almoco && cand >= almoco[0] && cand < almoco[1]) cand = almoco[1]
    if (cand < fecha) return new Date(`${data}T${hhmm(cand)}:00-03:00`)
  }
  return alvo
}

// Retornos que o gerente aceitou como "aguardando o cliente" ANTES de agendar o
// acompanhamento automático (últimos 7 dias): cria o que faltou, uma vez cada.
const MARCA_ACOMPANHAR = "(acompanhar a resposta do cliente)"
async function acompanhamentosAtrasados(): Promise<void> {
  const lista = await prisma.contactReminder.findMany({
    where: {
      conferencia: "CONCLUIDO", conferidaPorId: ID_GERENTE, conferenciaNota: { contains: MARCA_ACOMPANHAR },
      conferidaEm: { gte: new Date(Date.now() - 7 * 24 * 3_600_000) }, contact: { deletedAt: null },
    },
    take: 20, select: { id: true, userId: true, conferenciaNota: true, contact: { select: { id: true, name: true } } },
  })
  for (const r of lista) {
    const motivo = (r.conferenciaNota ?? "").replace(/^🤖\s*/, "").replace(MARCA_ACOMPANHAR, "").trim().slice(0, 200)
    const quando = await agendarAcompanhamento(r, motivo)
    // Mesmo sem agendar (já tinha um aberto), tira a marca para não reprocessar.
    await prisma.contactReminder.update({
      where: { id: r.id },
      data: { conferenciaNota: `🤖 ${motivo} ${quando ? `(retorno de acompanhamento agendado para ${horaBr(quando)})` : "(acompanhamento já agendado)"}`.slice(0, 300) },
    })
  }
}

// Revisão das reprovações automáticas anteriores ao critério v2 (últimos 3 dias,
// ainda reabertas): o gerente olha de novo com o chat inteiro e, se a pessoa tinha
// razão, aceita o retorno e avisa. Uma revisão por retorno.
async function reverReprovacoes(decidir: Decisor): Promise<void> {
  const lista = await prisma.contactReminder.findMany({
    where: {
      conferencia: "NAO_CONCLUIDO", conferidaPorId: ID_GERENTE, doneAt: null, canal: { not: null },
      conferidaEm: { gte: new Date(Date.now() - 3 * 24 * 3_600_000) }, contact: { deletedAt: null },
    },
    orderBy: { conferidaEm: "asc" }, take: 5,
    select: { id: true, userId: true, conferidaEm: true, contact: { select: { id: true, name: true } } },
  })
  for (const r of lista) {
    const chave = `gerente:revisao:v2:${r.id}`
    if ((await redis.incr(chave)) !== 1) continue
    await redis.expire(chave, 7 * 24 * 3600)
    if (!r.conferidaEm) continue
    const parecer = await decidir(r.id, { feitoEm: r.conferidaEm })
    if (parecer === "SEM_IA") return
    if (!parecer) { await redis.del(chave); continue } // IA falhou: tenta no próximo ciclo
    if (parecer.veredito === "NAO_CONCLUIDO") continue // continua reprovado, agora com mais contexto
    const aguardando = parecer.veredito === "AGUARDANDO_CLIENTE"
    const ok = await prisma.contactReminder.updateMany({
      where: { id: r.id, conferencia: "NAO_CONCLUIDO", doneAt: null },
      data: { conferencia: "CONCLUIDO", doneAt: r.conferidaEm, conferidaEm: new Date(), conferenciaNota: `🤖 Revisado: ${parecer.motivo}${aguardando ? " (acompanhar a resposta do cliente)" : ""}`.slice(0, 300) },
    })
    if (!ok.count) continue
    if (aguardando) await agendarAcompanhamento({ id: r.id, userId: r.userId, contact: r.contact }, parecer.motivo.slice(0, 200))
    sendPushToUsers([r.userId], {
      title: `✅ Retorno aceito após revisão: ${r.contact.name}`,
      body: "O gerente virtual reviu o chat e aceitou o seu retorno. Você não precisa refazer.",
      tag: `revisado-${r.id}`, url: `/admin/chats?contact=${r.contact.id}`,
    }).catch((e: unknown) => console.error("[gerente] push revisão falhou:", e instanceof Error ? e.message : e))
  }
}

// Cliente ainda não respondeu: agenda um retorno de acompanhamento para a própria
// pessoa (sujeito às mesmas cobranças: ciência, trava, conferência). Uma vez por retorno.
async function agendarAcompanhamento(r: { id: string; userId: string; contact: { id: string; name: string } }, motivo: string): Promise<Date | null> {
  const chave = `gerente:acompanhar:${r.id}`
  if ((await redis.incr(chave)) !== 1) return null // já agendado para este retorno
  await redis.expire(chave, 30 * 24 * 3600)
  const jaTem = await prisma.contactReminder.findFirst({
    where: { contactId: r.contact.id, userId: r.userId, doneAt: null, note: { startsWith: "🧑‍💼 Acompanhar" } }, select: { id: true },
  })
  if (jaTem) return null
  const cfg = await getUraConfigCached()
  const quando = proximoHorarioUtil(cfg, new Date(Date.now() + ACOMPANHAR_EM_MS))
  await prisma.contactReminder.create({
    data: { contactId: r.contact.id, userId: r.userId, dueAt: quando, cienteAt: new Date(), note: `🧑‍💼 Acompanhar: ${motivo}`.slice(0, 280) },
  })
  sendPushToUsers([r.userId], {
    title: `📌 Retorno de acompanhamento: ${r.contact.name}`,
    body: `O gerente virtual agendou para ${horaBr(quando)} ver se o cliente respondeu.`,
    tag: `acompanhar-${r.id}`, url: `/admin/chats?contact=${r.contact.id}`,
  }).catch((e: unknown) => console.error("[gerente] push acompanhamento falhou:", e instanceof Error ? e.message : e))
  return quando
}

export async function conferirRetornosAutomatico(decidir: Decisor = parecerDoRetorno): Promise<{ aceitos: number; reabertos: number; manuais: number }> {
  const total = { aceitos: 0, reabertos: 0, manuais: 0 }
  await acompanhamentosAtrasados()
  await reverReprovacoes(decidir)
  const lista = await prisma.contactReminder.findMany({
    where: { conferencia: "PENDENTE", doneAt: { not: null, lte: new Date(Date.now() - ESPERA_CONFERIR_MS) } },
    orderBy: { doneAt: "asc" }, take: 5,
    select: { id: true, userId: true, contact: { select: { id: true, name: true } } },
  })
  for (const r of lista) {
    const travaTentativa = `gerente:auto:tentativa:${r.id}`
    if (await redis.get(travaTentativa)) continue
    const parecer = await decidir(r.id)
    if (parecer === "SEM_IA") return total
    if (!parecer) { await redis.set(travaTentativa, "1"); await redis.expire(travaTentativa, 10 * 60); continue }

    const base = { conferidaEm: new Date(), conferidaPorId: ID_GERENTE }
    if (parecer.veredito === "CONCLUIDO" || parecer.veredito === "AGUARDANDO_CLIENTE") {
      const aguardando = parecer.veredito === "AGUARDANDO_CLIENTE"
      const sufixo = aguardando ? " (acompanhar a resposta do cliente)" : ""
      const ok = await prisma.contactReminder.updateMany({ where: { id: r.id, conferencia: "PENDENTE" }, data: { ...base, conferencia: "CONCLUIDO", conferenciaNota: `🤖 ${parecer.motivo}${sufixo}`.slice(0, 300) } })
      if (!ok.count) continue
      total.aceitos++
      if (aguardando) {
        // Autorizado pelo administrador: o gerente agenda o retorno de acompanhamento sozinho.
        const quando = await agendarAcompanhamento(r, parecer.motivo.slice(0, 200))
        if (quando) {
          await prisma.contactReminder.update({ where: { id: r.id }, data: { conferenciaNota: `🤖 ${parecer.motivo} (retorno de acompanhamento agendado para ${horaBr(quando)})`.slice(0, 300) } })
        }
      }
      continue
    }

    // NÃO CONCLUÍDO: escreve o que falta e devolve para a pessoa (até 2 vezes).
    const chaveRep = `gerente:reprovacoes:${r.id}`
    const vezes = await redis.incr(chaveRep)
    await redis.expire(chaveRep, 7 * 24 * 3600)
    const falta = (parecer.falta ?? parecer.motivo).slice(0, 300)
    if (vezes > MAX_REPROVACOES_AUTO) {
      // Já reprovado 2x: o administrador decide (fica na conferência manual).
      await redis.set(travaTentativa, "1"); await redis.expire(travaTentativa, 24 * 3600)
      const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
      sendPushToUsers(admins, { title: "🧑‍💼 Retorno precisa da sua conferência", body: `${r.contact.name}: reprovado 2x pelo gerente. ${falta}`, tag: `gerente-manual-${r.id}`, url: "/admin/gerente" })
        .catch((e: unknown) => console.error("[gerente] push manual falhou:", e instanceof Error ? e.message : e))
      total.manuais++
      continue
    }
    const novoPrazo = new Date(Date.now() + REABRIR_EM_MS)
    const ok = await prisma.contactReminder.updateMany({
      where: { id: r.id, conferencia: "PENDENTE" },
      data: { ...base, conferencia: "NAO_CONCLUIDO", conferenciaNota: `🤖 ${falta}`.slice(0, 300), doneAt: null, dueAt: novoPrazo, notifiedAt: null, escalonadoAt: null, cienteAt: null },
    })
    if (!ok.count) continue
    total.reabertos++
    sendPushToUsers([r.userId], {
      title: `❌ Retorno não aceito: ${r.contact.name}`,
      body: `${falta} Refaça até ${horaBr(novoPrazo)}.`,
      tag: `reaberto-${r.id}`, url: `/admin/chats?contact=${r.contact.id}`,
    }).catch((e: unknown) => console.error("[gerente] push reabertura falhou:", e instanceof Error ? e.message : e))
  }
  return total
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
    await conferirRetornosAutomatico()
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

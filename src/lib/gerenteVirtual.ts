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
import { fecharAusenciasVencidas, fimDaUltimaAusencia, idsAusentes } from "@/lib/ausencia"
import { getUraConfigCached, type UraConfigFull } from "@/lib/ura"
import { isBusinessHour } from "@/lib/businessHours"
import { idsOnline } from "@/lib/presence"
import { PREFIXO_PEDIDO_NOTA, primeiraRespostaHumana } from "@/lib/retornoAtendido"
import { redis } from "@/lib/redis"
import { parecerDoRetorno, type Parecer } from "@/lib/gerenteParecer"
import { tentarAtendenteVirtual } from "@/lib/atendenteVirtual"

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
      AND m.body !~* '^\\s*(ok|okay|obrigad[oa]|obg|valeu|show|top|blz|beleza|certo|combinado|perfeito|joia|jóia|👍|🙏)[\\s.!]*$'
    LEFT JOIN humana h ON h."contactId" = c.id
    WHERE c."chatStatus" = 'WAITING_AGENT' AND c."deletedAt" IS NULL
      AND c."excludeFromReports" = false AND (h.em IS NULL OR m."createdAt" > h.em)
    GROUP BY c.id
    HAVING GREATEST(MIN(m."createdAt"), ${desdeMin}) <= ${new Date(Date.now() - TOLERANCIA_ESPERA_MS)}`)
}

// Clientes da fila de um setor em que TODOS estão ausentes (botão Ausente). Para eles o
// assistente virtual assume na hora: responde uma vez e agenda o retorno com o setor.
export async function clientesDeSetorAusente(desdeMin: Date): Promise<{ contactId: string; whatsappId: string; refId: string }[]> {
  const ausentes = await idsAusentes()
  if (ausentes.size === 0) return []
  const espera = (await clientesSemResposta(desdeMin)).filter((e) => !e.userId)
  if (espera.length === 0) return []
  const [contatos, equipe] = await Promise.all([
    prisma.contact.findMany({ where: { id: { in: espera.map((e) => e.contactId) } }, select: { id: true, whatsappId: true, pendingDepartment: true } }),
    prisma.user.findMany({ where: { role: "AGENT", isActive: true, department: { not: null } }, select: { id: true, department: true } }),
  ])
  const porSetor = new Map<string, string[]>()
  for (const u of equipe) porSetor.set(String(u.department), [...(porSetor.get(String(u.department)) ?? []), u.id])
  const dados = new Map(contatos.map((c) => [c.id, c]))
  const saida: { contactId: string; whatsappId: string; refId: string }[] = []
  for (const e of espera) {
    const c = dados.get(e.contactId)
    const membros = c?.pendingDepartment ? porSetor.get(c.pendingDepartment) : undefined
    if (c && membros && membros.length > 0 && membros.every((id) => ausentes.has(id))) saida.push({ contactId: c.id, whatsappId: c.whatsappId, refId: e.refId })
  }
  return saida
}

async function iaAssumirSetorAusente(cfg: UraConfigFull): Promise<void> {
  for (const c of (await clientesDeSetorAusente(new Date(inicioDoExpediente(cfg))).catch(() => [])).slice(0, 5)) {
    // Uma vez por mensagem sem resposta; se a IA não puder entrar (desligada, lista de teste…), libera para tentar depois.
    const chave = `gerente:ia-ausencia:${c.refId}`
    if ((await redis.incr(chave)) !== 1) continue
    await redis.expire(chave, 24 * 3600)
    const assumiu = await tentarAtendenteVirtual({ id: c.contactId, whatsappId: c.whatsappId }, "AUSENCIA", async () => {}).catch(() => false)
    if (!assumiu) await redis.del(chave)
  }
}

async function abrirOcorrencias(cfg: UraConfigFull): Promise<void> {
  const inicio = new Date(inicioDoExpediente(cfg))
  const agora = new Date()
  const novas: { tipo: TipoOcorrencia; refId: string; userId: string | null; contactId: string; nome: string; desde: Date }[] = []

  for (const e of await clientesSemResposta(inicio)) {
    novas.push({ tipo: "ESPERA_CLIENTE", refId: e.refId, userId: e.userId, contactId: e.contactId, nome: e.nome, desde: new Date(Math.max(e.desde.getTime(), inicio.getTime())) })
  }

  // Retornos agendados que passaram do horário (+ tolerância) sem NINGUÉM da equipe
  // responder o cliente. Regras de justiça (para não cobrar atraso que não é real):
  //   • a contagem só começa no instante MAIS TARDIO entre o horário combinado, a criação
  //     do lembrete e a abertura do expediente (lembrete criado em cima da hora, ou que
  //     venceu de madrugada, não nasce atrasado);
  //   • resposta de QUALQUER pessoa da equipe ao cliente conta como atendimento.
  const atrasados = await prisma.contactReminder.findMany({
    where: {
      doneAt: null, contact: { deletedAt: null },
      dueAt: { lte: new Date(agora.getTime() - TOLERANCIA_RETORNO_MS), gte: new Date(agora.getTime() - 24 * 60 * 60_000) },
    },
    take: 100, orderBy: { dueAt: "asc" },
    select: { id: true, userId: true, dueAt: true, createdAt: true, contact: { select: { id: true, name: true } } },
  })
  if (atrasados.length) {
    const respostas = await primeiraRespostaHumana(atrasados.map((a) => a.id))
    for (const a of atrasados) {
      const resp = respostas.get(a.id)
      if (resp?.dono || resp?.outro) continue
      const contagemDesde = Math.max(a.dueAt.getTime(), a.createdAt.getTime(), inicio.getTime())
      if (contagemDesde > agora.getTime() - TOLERANCIA_RETORNO_MS) continue
      novas.push({ tipo: "RETORNO_ATRASADO", refId: `${a.id}:${a.dueAt.getTime()}`, userId: a.userId, contactId: a.contact.id, nome: a.contact.name, desde: new Date(contagemDesde) })
    }
  }
  // Ausente (botão "Ausente") não é cobrado enquanto está fora, e a contagem recomeça
  // só depois que volta (com a mesma tolerância de sempre).
  const ausentes = await idsAusentes()
  for (let i = novas.length - 1; i >= 0; i--) {
    const uid = novas[i].userId
    if (!uid) continue
    const tol = novas[i].tipo === "ESPERA_CLIENTE" ? TOLERANCIA_ESPERA_MS : TOLERANCIA_RETORNO_MS
    if (ausentes.has(uid) || (await fimDaUltimaAusencia(uid)) > agora.getTime() - tol) novas.splice(i, 1)
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

// A fila é por SETOR (a URA grava o setor escolhido em pendingDepartment e a página
// Fila de espera mostra o cliente só para quem é do setor). O gerente segue a mesma
// regra: cliente da fila do Financeiro só interessa à equipe do Financeiro.
// Sem setor (entrada fora da URA) ou setor sem ninguém cadastrado: vale para todos.
const rotuloSetor = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ")

async function setoresComPessoas(): Promise<Set<string>> {
  const linhas = await prisma.user.groupBy({ by: ["department"], where: { role: "AGENT", isActive: true, department: { not: null } } })
  return new Set(linhas.map((l) => String(l.department)))
}

// Mantém só os itens da fila que a pessoa deve ver/confirmar (itens com dono não passam por aqui).
export async function filtrarFilaDoSetor<T extends { contactId: string }>(userId: string, itens: T[]): Promise<T[]> {
  if (itens.length === 0) return itens
  const [eu, contatos, setores] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { department: true } }),
    prisma.contact.findMany({ where: { id: { in: itens.map((i) => i.contactId) } }, select: { id: true, pendingDepartment: true } }),
    setoresComPessoas(),
  ])
  const setorDe = new Map(contatos.map((c) => [c.id, c.pendingDepartment]))
  return itens.filter((i) => {
    const pd = setorDe.get(i.contactId)
    return !pd || !setores.has(pd) || String(eu?.department ?? "") === pd
  })
}

async function avisarPessoa(tipo: TipoOcorrencia, userId: string | null, contactId: string, nome: string, desde: Date): Promise<void> {
  let alvo: string[]
  if (userId) alvo = [userId]
  else {
    const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { pendingDepartment: true } })
    const pd = c?.pendingDepartment ?? null
    const equipe = pd && (await setoresComPessoas()).has(pd)
      ? (await prisma.user.findMany({ where: { role: "AGENT", isActive: true, department: pd as never }, select: { id: true } })).map((u) => u.id)
      : null
    const ausentes = await idsAusentes()
    alvo = (equipe ?? [...(await idsOnline())]).filter((id) => !ausentes.has(id))
    // Setor existe, mas ninguém dele está disponível (todos ausentes): só um administrador
    // pode agir (a Fila não deixa outro setor assumir), então o aviso vai a ele já.
    if (alvo.length === 0 && equipe && tipo === "ESPERA_CLIENTE") {
      const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
      await mensagemAosAdmins(admins, `⚠️ Gerente virtual: ${nome} está na fila do setor ${rotuloSetor(pd as string)} há ${minutos(Date.now() - desde.getTime())} min e ninguém do setor está disponível agora (ausente). Assuma ou redirecione: /admin/chats?contact=${contactId}`)
      sendPushToUsers(admins, { title: `⚠️ ${nome} sem ninguém no setor`, body: `Fila do ${rotuloSetor(pd as string)}: ninguém disponível.`, tag: `gerente-setor-${contactId}`, url: `/admin/chats?contact=${contactId}` })
        .catch((e: unknown) => console.error("[gerente] push setor falhou:", e instanceof Error ? e.message : e))
      return
    }
  }
  if (alvo.length === 0) return
  const espera = tipo === "ESPERA_CLIENTE"
  await sendPushToUsers(alvo, {
    title: espera ? `⏱️ Cliente aguardando: ${nome}` : `⏰ Retorno pendente: ${nome}`,
    body: espera
      ? `Há ${minutos(Date.now() - desde.getTime())} min sem resposta (nossa meta é 1 min). Quando puder, atenda.`
      : `Combinado para ${horaBr(desde)}. Quando puder, faça o retorno.`,
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
  const lembretesAtuais = new Map((await prisma.contactReminder.findMany({
    where: { id: { in: lembretes } }, select: { id: true, doneAt: true, dueAt: true },
  })).map((r) => [r.id, r]))
  const feitos = new Map([...lembretesAtuais].map(([id, r]) => [id, r.doneAt]))
  // O retorno foi ADIADO (horário mudou) ou APAGADO: o atraso daquele horário não vale mais.
  const naoVale = (o: { tipo: string; refId: string }) => {
    if (o.tipo !== "RETORNO_ATRASADO") return false
    const [id, dueMs] = o.refId.split(":")
    const r = lembretesAtuais.get(id)
    return !r || (Boolean(dueMs) && r.dueAt.getTime() !== Number(dueMs))
  }

  for (const o of abertas) {
    const resp = respostas.find((r) => r.contactId === o.contactId && r.createdAt > o.desde)
    const c = porId.get(o.contactId)
    let fim: Date | null = null
    let por: string | null = null
    if (resp) { fim = resp.createdAt; por = resp.agentId }
    else if (o.tipo === "ESPERA_CLIENTE" && retornosAbertos.some((r) => r.contactId === o.contactId && r.createdAt >= (mensagensEspera.get(o.refId) ?? o.desde))) fim = new Date()
    else if (o.tipo === "RETORNO_ATRASADO" && feitos.get(o.refId.split(":")[0])) fim = feitos.get(o.refId.split(":")[0]) ?? null
    else if (naoVale(o)) fim = new Date()
    else if (!c || c.deletedAt || (o.tipo === "ESPERA_CLIENTE" && c.chatStatus !== "WAITING_AGENT")) fim = new Date()
    else if (agora - o.abertaEm.getTime() > 24 * 60 * 60_000) fim = new Date()
    if (!fim) continue
    const fechou = await prisma.gerenteOcorrencia.updateMany({
      where: { id: o.id, resolvidaEm: null },
      data: { resolvidaEm: fim, resolvidaPorId: por, esperaMin: Math.max(0, Math.round((fim.getTime() - o.desde.getTime()) / 60_000)) },
    })
    if (fechou.count > 0 && o.escaladaEm) await marcarAvisoResolvido(o.contactId, o.escaladaEm, fim)
  }
}

// O aviso enviado ao administrador não fica com cara de pendente depois que o
// cliente é atendido: troca o ℹ️ por ✅ e informa a hora da resolução.
async function marcarAvisoResolvido(contactId: string, escaladaEm: Date, fim: Date): Promise<void> {
  try {
    const avisos = await prisma.internalMessage.findMany({
      where: {
        senderId: ID_GERENTE, createdAt: { gte: new Date(escaladaEm.getTime() - 60_000) },
        body: { startsWith: "ℹ️ Gerente virtual:", contains: `contact=${contactId}` },
      },
      select: { id: true, body: true }, take: 10,
    })
    for (const a of avisos) {
      await prisma.internalMessage.update({
        where: { id: a.id },
        data: { body: `✅ ${a.body.slice("ℹ️ ".length)} — Resolvido às ${horaBr(fim)}.` },
      })
    }
  } catch (err) {
    console.error("[gerente] marcar aviso resolvido falhou:", err instanceof Error ? err.message : err)
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

// Depois do aviso, 5 min sem atendimento → informa o admin (chat interno +
// notificação) para APOIAR, e avisa a própria pessoa de que ele foi informado.
async function avisarDiretoria(): Promise<void> {
  const limite = new Date(Date.now() - ESCALA_DIRETORIA_MS)
  const pendentes = await prisma.gerenteOcorrencia.findMany({
    where: { resolvidaEm: null, escaladaEm: null, abertaEm: { lte: limite } }, take: 50,
  })
  // Quem está "ausente" não gera aviso ao administrador enquanto estiver fora.
  const ausentes = await idsAusentes()
  const aEscalar = pendentes.filter((o) => !o.userId || !ausentes.has(o.userId))
  pendentes.length = 0
  pendentes.push(...aEscalar)
  if (pendentes.length === 0) return
  const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
  const ids = [...new Set([...pendentes.map((p) => p.userId).filter((x): x is string => Boolean(x)), ...pendentes.map((p) => p.contactId)])]
  const [usuarios, contatos] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.contact.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, pendingDepartment: true } }),
  ])
  const setoresOk = await setoresComPessoas()
  const setorDoContato = new Map(contatos.map((c) => [c.id, c.pendingDepartment && setoresOk.has(c.pendingDepartment) ? c.pendingDepartment : null]))
  const nomeUsuario = new Map(usuarios.map((u) => [u.id, u.name]))
  const nomeContato = new Map(contatos.map((c) => [c.id, c.name]))
  for (const o of pendentes) {
    const marcou = await prisma.gerenteOcorrencia.updateMany({ where: { id: o.id, escaladaEm: null, resolvidaEm: null }, data: { escaladaEm: new Date() } })
    if (marcou.count === 0) continue
    const quem = o.userId ? primeiroNome(nomeUsuario.get(o.userId)) : null
    const cliente = nomeContato.get(o.contactId) ?? "cliente"
    const min = minutos(Date.now() - o.desde.getTime())
    const motivo = o.tipo === "ESPERA_CLIENTE"
      ? `${cliente} está há ${min} min sem atendimento`
      : `o retorno de ${cliente} (combinado para ${horaBr(o.desde)}) está atrasado há ${min} min`
    await mensagemAosAdmins(admins, `ℹ️ Gerente virtual: ${motivo}. ${quem ? `${quem} já foi avisada(o) há ${Math.round(ESCALA_DIRETORIA_MS / 60_000)} min e pode precisar de apoio` : setorDoContato.get(o.contactId) ? `Ninguém assumiu ainda: cliente na fila do setor ${rotuloSetor(setorDoContato.get(o.contactId) as string)}, e a equipe desse setor já foi avisada` : "Ninguém assumiu ainda (cliente sem responsável) e a equipe online já foi avisada"}. Conversa: /admin/chats?contact=${o.contactId}`)
    sendPushToUsers(admins, {
      title: `ℹ️ ${cliente} continua aguardando`, body: `${quem ? `${quem} já foi avisada(o) e pode precisar de apoio` : "Ninguém assumiu ainda"}. ${motivo}.`,
      tag: `gerente-adm-${o.id}`, url: `/admin/chats?contact=${o.contactId}`,
    }).catch((e: unknown) => console.error("[gerente] push diretoria falhou:", e instanceof Error ? e.message : e))
    if (o.userId) {
      sendPushToUsers([o.userId], {
        title: "ℹ️ Aviso ao administrador", body: `${cliente} continua aguardando. O administrador foi informado para apoiar o atendimento.`,
        tag: `gerente-pessoa-${o.id}`, url: `/admin/chats?contact=${o.contactId}`,
      }).catch((e: unknown) => console.error("[gerente] push pessoa falhou:", e instanceof Error ? e.message : e))
    }
  }
}

// Quem já foi informado e continua sem atendimento: o administrador recebe um lembrete
// a cada 30 min (até 8 por caso), para um cliente não ficar horas esquecido.
const LEMBRETE_DIRETORIA_MS = 30 * 60_000
async function relembrarDiretoria(): Promise<void> {
  const agora = Date.now()
  const abertas = await prisma.gerenteOcorrencia.findMany({
    where: { resolvidaEm: null, escaladaEm: { lte: new Date(agora - LEMBRETE_DIRETORIA_MS) } }, take: 20, orderBy: { desde: "asc" },
  })
  if (abertas.length === 0) return
  const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
  const contatos = await prisma.contact.findMany({ where: { id: { in: abertas.map((o) => o.contactId) } }, select: { id: true, name: true, pendingDepartment: true } })
  const info = new Map(contatos.map((c) => [c.id, c]))
  for (const o of abertas) {
    const janela = Math.floor((agora - (o.escaladaEm as Date).getTime()) / LEMBRETE_DIRETORIA_MS)
    if (janela < 1 || janela > 8) continue
    const chave = `gerente:relembrar:${o.id}:${janela}`
    if ((await redis.incr(chave)) !== 1) continue
    await redis.expire(chave, 3 * 3600)
    const c = info.get(o.contactId)
    const setor = c?.pendingDepartment ? ` (setor ${rotuloSetor(c.pendingDepartment)})` : ""
    const motivo = o.tipo === "ESPERA_CLIENTE" ? "sem atendimento" : "com o retorno atrasado"
    await mensagemAosAdmins(admins, `⏳ Gerente virtual: ${c?.name ?? "cliente"}${setor} continua ${motivo} há ${minutos(agora - o.desde.getTime())} min. Conversa: /admin/chats?contact=${o.contactId}`)
  }
}

// ─── Conferência automática dos retornos ────────────────────────────────────
// Retorno marcado como feito (com canal + relato) é conferido sozinho pelo
// gerente: certo → CONCLUÍDO; faltando algo → sugestão ao administrador (nunca
// reabre nem cobra a pessoa sozinho).
// a pessoa. Salvaguardas: espera 1 min após marcar; o gerente só ACEITA sozinho —
// quando acha que falta algo, apenas sugere ao administrador, que decide; se a IA
// falhar, tenta de novo em 10 min e nunca decide no escuro.
const ESPERA_CONFERIR_MS = 60_000
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

    // NÃO CONCLUÍDO: NUNCA reabre nem cobra a pessoa sozinho. O gerente deixa o retorno
    // na conferência com a sugestão ("o que falta") e avisa o administrador, que decide
    // (revisão humana antes de qualquer consequência para a pessoa).
    const falta = (parecer.falta ?? parecer.motivo).slice(0, 300)
    await redis.set(travaTentativa, "1"); await redis.expire(travaTentativa, 24 * 3600)
    const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
    sendPushToUsers(admins, {
      title: "🧑‍💼 Retorno com sugestão de ajuste", body: `${r.contact.name}: ${falta}`,
      tag: `gerente-sugestao-${r.id}`, url: "/admin/gerente",
    }).catch((e: unknown) => console.error("[gerente] push sugestão falhou:", e instanceof Error ? e.message : e))
    total.manuais++
  }
  return total
}

// ─── Retenção: registros do gerente guardados por 90 dias ────────────────────
// Apaga as ocorrências e as mensagens do gerente; nos retornos, limpa só os textos
// avaliativos (relato, parecer, contestação) — o retorno em si é dado comercial.
export const RETENCAO_DIAS = 90
export async function limparRegistrosAntigos(): Promise<{ ocorrencias: number; retornos: number; mensagens: number; ausencias: number }> {
  const corte = new Date(Date.now() - RETENCAO_DIAS * 86_400_000)
  const [oc, ret, msg, aus] = await Promise.all([
    prisma.gerenteOcorrencia.deleteMany({ where: { abertaEm: { lt: corte } } }),
    prisma.contactReminder.updateMany({
      where: { OR: [{ relato: { not: null } }, { conferenciaNota: { not: null } }, { contestacao: { not: null } }], createdAt: { lt: corte }, NOT: { doneAt: null, conferencia: "NAO_CONCLUIDO" } },
      data: { relato: null, conferenciaNota: null, contestacao: null, contestadaEm: null },
    }),
    prisma.internalMessage.deleteMany({ where: { senderId: ID_GERENTE, createdAt: { lt: corte } } }),
    prisma.ausencia.deleteMany({ where: { inicio: { lt: corte } } }),
  ])
  await prisma.tarefa.deleteMany({ where: { concluidaAt: { lt: corte } } })
  await prisma.aviso.deleteMany({ where: { createdAt: { lt: corte } } })
  return { ocorrencias: oc.count, retornos: ret.count, mensagens: msg.count, ausencias: aus.count }
}

async function limpezaDiaria(): Promise<void> {
  const chave = `gerente:limpeza:${new Date().toISOString().slice(0, 10)}`
  if ((await redis.incr(chave)) !== 1) return
  await redis.expire(chave, 2 * 86_400)
  const r = await limparRegistrosAntigos()
  if (r.ocorrencias || r.retornos || r.mensagens || r.ausencias) console.log(`[gerente] retenção ${RETENCAO_DIAS} dias: ${JSON.stringify(r)}`)
}

// ─── Tarefas do administrador ───────────────────────────────────────────────
const quandoBr = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

// Avisa a pessoa de uma tarefa nova (chat interno + push).
export async function avisarNovaTarefa(paraUserId: string, titulo: string, prazoEm: Date, deNome: string): Promise<void> {
  await mensagemAosAdmins([paraUserId], `📝 Nova tarefa de ${primeiroNome(deNome)}: “${titulo}”. Prazo para resolver: ${quandoBr(prazoEm)}. Você pode aceitar o prazo ou, se não der, propor outro com justificativa. Ao terminar, escreva o feedback em Minhas tarefas (/admin/tarefas).`)
  sendPushToUsers([paraUserId], { title: "📝 Nova tarefa para você", body: `${titulo} — prazo para resolver: ${quandoBr(prazoEm)}`, tag: `tarefa-${paraUserId}`, url: "/admin/tarefas" })
    .catch((e: unknown) => console.error("[tarefas] push falhou:", e instanceof Error ? e.message : e))
}

// Tarefa vencida sem feedback: 5 min depois do prazo cobra a pessoa; 5 min depois
// disso informa o administrador. Quem está "ausente" não é cobrado.
async function cobrarTarefasAtrasadas(): Promise<void> {
  const agora = Date.now()
  const vencidas = await prisma.tarefa.findMany({
    where: { concluidaAt: null, prazoEm: { lte: new Date(agora - TOLERANCIA_RETORNO_MS) } }, take: 50, orderBy: { prazoEm: "asc" },
  })
  if (vencidas.length === 0) return
  const ausentes = await idsAusentes()
  const nomes = new Map((await prisma.user.findMany({ where: { id: { in: [...new Set(vencidas.map((t) => t.paraUserId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  for (const t of vencidas) {
    if (ausentes.has(t.paraUserId)) continue
    // Pediu outro prazo e o administrador ainda não decidiu: não cobra enquanto isso.
    if (t.propostaStatus === "PENDENTE") continue
    // Depois de uma decisão do administrador a contagem recomeça dali.
    if (t.decididaEm && t.decididaEm.getTime() > agora - TOLERANCIA_RETORNO_MS) continue
    if (!t.avisadaAt) {
      const m = await prisma.tarefa.updateMany({ where: { id: t.id, avisadaAt: null, concluidaAt: null }, data: { avisadaAt: new Date() } })
      if (m.count === 0) continue
      await mensagemAosAdmins([t.paraUserId], `⏰ A tarefa “${t.titulo}” (prazo ${quandoBr(t.prazoEm)}) ainda não tem feedback. Quando puder, conclua em Minhas tarefas (/admin/tarefas) e escreva o que foi feito.`)
      sendPushToUsers([t.paraUserId], { title: "⏰ Tarefa pendente", body: `${t.titulo} — prazo ${quandoBr(t.prazoEm)}`, tag: `tarefa-atraso-${t.id}`, url: "/admin/tarefas" })
        .catch((e: unknown) => console.error("[tarefas] push atraso falhou:", e instanceof Error ? e.message : e))
    } else if (!t.escaladaEm && agora - t.avisadaAt.getTime() >= ESCALA_DIRETORIA_MS) {
      const m = await prisma.tarefa.updateMany({ where: { id: t.id, escaladaEm: null, concluidaAt: null }, data: { escaladaEm: new Date() } })
      if (m.count === 0) continue
      const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
      await mensagemAosAdmins(admins, `ℹ️ Gerente virtual: a tarefa “${t.titulo}” de ${primeiroNome(nomes.get(t.paraUserId))} (prazo ${quandoBr(t.prazoEm)}) continua sem feedback. Ela já foi avisada. Veja em /admin/tarefas`)
    }
  }
}

// Avisa o administrador de que a pessoa pediu outro prazo (e o motivo).
export async function avisarPropostaDePrazo(tarefaId: string, quemNome: string, titulo: string, prazoOriginal: Date, proposto: Date, justificativa: string): Promise<void> {
  const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
  await mensagemAosAdmins(admins, `🗓️ ${primeiroNome(quemNome)} pediu outro prazo para “${titulo}”: de ${quandoBr(prazoOriginal)} para ${quandoBr(proposto)}. Motivo: ${justificativa}. Aprove ou mantenha em /admin/tarefas`)
  sendPushToUsers(admins, { title: "🗓️ Pedido de novo prazo", body: `${primeiroNome(quemNome)}: ${titulo} → ${quandoBr(proposto)}`, tag: `tarefa-prazo-${tarefaId}`, url: "/admin/tarefas" })
    .catch((e: unknown) => console.error("[tarefas] push proposta falhou:", e instanceof Error ? e.message : e))
}

// Avisa a pessoa da decisão do administrador sobre o prazo.
export async function avisarDecisaoDePrazo(paraUserId: string, titulo: string, aprovada: boolean, prazo: Date, nota: string | null): Promise<void> {
  const texto = aprovada
    ? `✅ Seu novo prazo para “${titulo}” foi aprovado: ${quandoBr(prazo)}.`
    : `ℹ️ O prazo de “${titulo}” foi mantido: ${quandoBr(prazo)}.${nota ? ` Observação: ${nota}` : ""}`
  await mensagemAosAdmins([paraUserId], texto)
  sendPushToUsers([paraUserId], { title: aprovada ? "✅ Novo prazo aprovado" : "ℹ️ Prazo mantido", body: texto, tag: `tarefa-decisao-${paraUserId}`, url: "/admin/tarefas" })
    .catch((e: unknown) => console.error("[tarefas] push decisão falhou:", e instanceof Error ? e.message : e))
}

// Avisa quem criou a tarefa (ou, se não puder, os administradores) de que a pessoa
// concluiu com feedback — para ele confirmar o recebimento ("Recebi").
export async function avisarTarefaConcluida(tarefaId: string, criadaPorId: string, quemNome: string, titulo: string, feedback: string, noPrazo: boolean): Promise<void> {
  const criador = await prisma.user.findFirst({ where: { id: criadaPorId, isActive: true, role: "ADMIN" }, select: { id: true } })
  const alvo = criador ? [criador.id] : (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
  if (alvo.length === 0) return
  const resumo = feedback.length > 140 ? `${feedback.slice(0, 140)}…` : feedback
  await mensagemAosAdmins(alvo, `✅ ${primeiroNome(quemNome)} concluiu “${titulo}”${noPrazo ? "" : " (fora do prazo)"}. Feedback: ${resumo} — Confirme que recebeu em /admin/tarefas`)
  sendPushToUsers(alvo, { title: "✅ Tarefa concluída", body: `${primeiroNome(quemNome)}: ${titulo}. Confirme o recebimento.`, tag: `tarefa-concluida-${tarefaId}`, url: "/admin/tarefas" })
    .catch((e: unknown) => console.error("[tarefas] push conclusão falhou:", e instanceof Error ? e.message : e))
}

// Avisa a pessoa de que o administrador recebeu o feedback.
export async function avisarRecebimento(paraUserId: string, tarefaId: string, adminNome: string, titulo: string, nota: string | null): Promise<void> {
  const texto = `✅ ${primeiroNome(adminNome)} recebeu o seu feedback da tarefa “${titulo}”.${nota ? ` Observação: ${nota}` : ""}`
  await mensagemAosAdmins([paraUserId], texto)
  sendPushToUsers([paraUserId], { title: "✅ Feedback recebido", body: texto, tag: `tarefa-recebida-${tarefaId}`, url: "/admin/tarefas" })
    .catch((e: unknown) => console.error("[tarefas] push recebimento falhou:", e instanceof Error ? e.message : e))
}

// Avisa as pessoas escolhidas de que há um aviso novo (chat interno + push).
// "lembrete" = reenvio para quem ainda não deu ciência.
export async function avisarNovoAviso(userIds: string[], avisoId: string, titulo: string, deNome: string, lembrete = false): Promise<void> {
  if (userIds.length === 0) return
  await mensagemAosAdmins(userIds, `${lembrete ? "🔔 Lembrete — aviso" : "📢 Aviso"} de ${primeiroNome(deNome)}: “${titulo}”. Leia e dê o ciente na janela que aparece na tela (ou em Avisos, /admin/avisos).`)
  sendPushToUsers(userIds, { title: lembrete ? "🔔 Aviso aguardando ciência" : "📢 Novo aviso", body: titulo, tag: `aviso-${avisoId}`, url: "/admin/avisos" })
    .catch((e: unknown) => console.error("[avisos] push falhou:", e instanceof Error ? e.message : e))
}

export async function verificarGerente(): Promise<void> {
  if (rodando) return
  rodando = true
  try {
    await resolverOcorrencias() // sempre: quem atendeu fora do horário também fecha
    await fecharAusenciasVencidas()
    await limpezaDiaria()
    const cfg = await getUraConfigCached()
    if (cfg.isActive && isBusinessHour(cfg) !== "OPEN") return
    await abrirOcorrencias(cfg)
    await iaAssumirSetorAusente(cfg)
    await avisarDiretoria()
    await relembrarDiretoria()
    await conferirRetornosAutomatico()
    await cobrarTarefasAtrasadas()
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

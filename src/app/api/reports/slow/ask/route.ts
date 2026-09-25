import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"
import { sendPushToUsers } from "@/lib/push"
import { acharOuCriarDM } from "@/lib/internalChat"
import { listarRespostasLentas, hojeNoBrasil, resolverPeriodo, type TipoPeriodo } from "@/lib/reports/dailyReport"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/
const TIPOS: TipoPeriodo[] = ["dia", "semana", "mes"]
const MAX_NA_MENSAGEM = 15

function duracao(seg: number): string {
  const min = Math.round(seg / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto === 0 ? `${h}h` : `${h}h${String(resto).padStart(2, "0")}`
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

// ─── POST /api/reports/slow/ask ───────────────────────────────────────────────
// Manda os casos de espera pro chat interno da vendedora, pedindo explicação.
// Chega onde ela já trabalha, fica registrado na conversa, e não exige baixar,
// anexar e enviar arquivo.
//
// A lista é montada AQUI, no servidor, a partir dos mesmos dados do relatório —
// não recebemos texto pronto da tela, senão daria pra mandar qualquer coisa em
// nome do relatório.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  let body: { agentId?: string; dia?: string; periodo?: string; recado?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const agentId = body.agentId?.trim()
  if (!agentId) return NextResponse.json({ error: "Informe a vendedora" }, { status: 400 })
  if (body.dia && !DIA_VALIDO.test(body.dia)) {
    return NextResponse.json({ error: "Use dia=AAAA-MM-DD" }, { status: 400 })
  }
  const tipo = body.periodo ?? "dia"
  if (!TIPOS.includes(tipo as TipoPeriodo)) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 })
  }

  const agente = await prisma.user.findFirst({
    where: { id: agentId, isActive: true },
    select: { id: true, name: true },
  })
  if (!agente) return NextResponse.json({ error: "Vendedora não encontrada" }, { status: 404 })

  const periodo = resolverPeriodo(tipo as TipoPeriodo, body.dia ?? hojeNoBrasil())
  const casos = await listarRespostasLentas(periodo.ini, periodo.fim, agentId)
  if (casos.length === 0) {
    return NextResponse.json({ error: "Nenhum caso nesse período — nada a perguntar." }, { status: 400 })
  }

  const recado = (body.recado ?? "").trim().slice(0, 500)
  const linhas: string[] = [
    `📋 *Atendimentos que demoraram* — ${periodo.rotulo}`,
    "",
    recado || "Oi! Vi estes clientes esperando mais de 1 hora. Pode me contar o que aconteceu em cada um?",
    "",
  ]
  for (const c of casos.slice(0, MAX_NA_MENSAGEM)) {
    const espera = c.respostaEm ? `esperou ${duracao(c.esperaSeg)}` : "*ficou sem resposta*"
    linhas.push(`• *${c.cliente}* — ${espera}`)
    linhas.push(`  escreveu ${hora(c.clienteEm)}${c.pergunta ? `: "${c.pergunta.slice(0, 80)}"` : ""}`)
  }
  if (casos.length > MAX_NA_MENSAGEM) {
    linhas.push("", `_(e mais ${casos.length - MAX_NA_MENSAGEM} — a lista completa está no relatório)_`)
  }
  const texto = linhas.join("\n")

  const conversationId = await acharOuCriarDM(me.id, agentId)
  if (!conversationId) {
    return NextResponse.json({ error: "Não foi possível abrir a conversa" }, { status: 400 })
  }

  const salva = await prisma.internalMessage.create({
    data: { conversationId, senderId: me.id, body: texto },
    select: { id: true, body: true, createdAt: true },
  })
  await prisma.internalConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  })

  const membros = await prisma.internalConversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  })
  const ids = membros.map((m) => m.userId)

  broadcastToUsers(ids, {
    type: "internal_message",
    data: {
      id: salva.id,
      conversationId,
      senderId: me.id,
      senderName: me.name,
      body: salva.body,
      mediaUrl: null,
      mediaType: null,
      createdAt: salva.createdAt.toISOString(),
    },
  })
  void sendPushToUsers([agentId], {
    title: me.name,
    body: "Atendimentos que demoraram — pode me explicar?",
    tag: `mensagens-${conversationId}`,
    url: "/admin/mensagens",
  })

  return NextResponse.json({ ok: true, conversationId, casos: casos.length })
}

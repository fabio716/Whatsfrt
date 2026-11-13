import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { PREFIXO_PEDIDO_NOTA } from "@/lib/retornoAtendido"

export const dynamic = "force-dynamic"

// Conversa por trás de um retorno, pra o administrador conferir: o que o
// cliente disse, o que o robô respondeu e o que a equipe fez depois — com a
// mensagem que contou como atendimento destacada. Só leitura, só admin.

const RELOGIO = { timeZone: "America/Sao_Paulo" }
const ROTULO_MIDIA: Record<string, string> = { image: "[imagem]", audio: "[áudio]", video: "[vídeo]", application: "[documento]", sticker: "[figurinha]" }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const id = request.nextUrl.searchParams.get("id") ?? ""
  const lembrete = await prisma.contactReminder.findUnique({
    where: { id },
    select: { contactId: true, userId: true, createdAt: true, dueAt: true, doneAt: true, user: { select: { name: true } } },
  })
  if (!lembrete) return NextResponse.json({ error: "Retorno não encontrado." }, { status: 404 })

  const mensagens = await prisma.message.findMany({
    where: { contactId: lembrete.contactId, createdAt: { gte: new Date(lembrete.createdAt.getTime() - 12 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "asc" },
    take: 80,
    select: {
      id: true, body: true, direction: true, mediaType: true, createdAt: true, viaAtendente: true, isBroadcast: true,
      agentId: true, agent: { select: { name: true } },
    },
  })

  let contouId: string | null = null
  const lista = mensagens.map((m) => {
    const tipo = m.direction === "INBOUND" ? "cliente" : m.viaAtendente ? "robo" : m.agentId ? "equipe" : "sistema"
    const semValor = tipo === "equipe" && (m.isBroadcast || m.body.startsWith(PREFIXO_PEDIDO_NOTA))
    const deOutra = tipo === "equipe" && !semValor && m.agentId !== lembrete.userId
    const naoConta = semValor || deOutra
    const conta = tipo === "equipe" && !naoConta && m.createdAt > lembrete.createdAt
    if (conta && !contouId) contouId = m.id
    const midia = ROTULO_MIDIA[(m.mediaType ?? "").split("/")[0].toLowerCase()] ?? (m.mediaType ? "[arquivo]" : "")
    return {
      id: m.id,
      tipo,
      quem: tipo === "cliente" ? "Cliente" : tipo === "robo" ? "Robô" : tipo === "equipe" ? (m.agent?.name ?? "Equipe") : "Sistema",
      texto: (m.body.trim() || midia).slice(0, 400),
      em: m.createdAt.toISOString(),
      naoConta: semValor ? (m.isBroadcast ? "transmissão em massa" : "pedido de nota ao encerrar") : deOutra ? `outra pessoa, não é a responsável ${lembrete.user.name}` : null,
      contou: false,
    }
  })
  for (const m of lista) m.contou = m.id === contouId

  return NextResponse.json({
    agente: lembrete.user.name,
    combinado: lembrete.dueAt.toISOString(),
    criadoEm: lembrete.createdAt.toISOString(),
    feitoEm: lembrete.doneAt ? lembrete.doneAt.toISOString() : null,
    mensagens: lista,
    relogio: RELOGIO.timeZone,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { aiConfigured, suggestReply } from "@/lib/ai"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// POST /api/ai/suggest { contactId } → { suggestion }
// Copiloto: gera um RASCUNHO de resposta pro atendimento. Nunca envia nada.
// AGENT só para contato da própria carteira; ADMIN qualquer um.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  if (!aiConfigured()) {
    return NextResponse.json({
      error: "Copiloto ainda não configurado — falta a chave da IA no servidor (ANTHROPIC_API_KEY). Avise o administrador.",
    }, { status: 503 })
  }

  let body: { contactId?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  if (!body.contactId) return NextResponse.json({ error: "contactId é obrigatório" }, { status: 400 })

  const contact = await prisma.contact.findUnique({
    where: { id: body.contactId },
    select: {
      id: true, name: true, empresa: true, notes: true, temperature: true,
      assignedUserId: true,
      tags: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { body: true, direction: true, mediaType: true },
      },
    },
  })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  if (auth.role === "AGENT" && contact.assignedUserId !== auth.id) {
    return NextResponse.json({ error: "Sem permissão para este contato" }, { status: 403 })
  }

  const [knowledge, agent] = await Promise.all([
    prisma.aiKnowledge.findUnique({ where: { id: "main" }, select: { content: true } }),
    prisma.user.findUnique({ where: { id: auth.id }, select: { name: true } }),
  ])

  const transcript = [...contact.messages].reverse().map((m) => {
    const who = m.direction === "INBOUND" ? "CLIENTE" : "VENDEDORA"
    const texto = m.body?.trim() || (m.mediaType?.startsWith("image/") ? "[enviou uma imagem]"
      : m.mediaType?.startsWith("audio/") ? "[enviou um áudio]"
      : m.mediaType?.startsWith("video/") ? "[enviou um vídeo]"
      : m.mediaType ? "[enviou um arquivo]" : "[mensagem vazia]")
    return `${who}: ${texto}`
  }).join("\n")

  try {
    const suggestion = await suggestReply({
      knowledge: knowledge?.content ?? "",
      contactName: contact.name,
      empresa: contact.empresa,
      temperature: contact.temperature,
      tags: contact.tags.map((t) => t.name),
      notes: contact.notes,
      transcript,
      agentName: agent?.name ?? "Vendedora",
    })
    return NextResponse.json({ suggestion })
  } catch (err) {
    console.error("[copiloto] falha ao gerar sugestão:", err instanceof Error ? err.message : err)
    return NextResponse.json({
      error: err instanceof Error && err.message.startsWith("A IA")
        ? err.message
        : "Falha ao gerar a sugestão — tente de novo em instantes.",
    }, { status: 502 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── GET /api/chats/search?q=termo ────────────────────────────────────────────
// Busca conversas no histórico COMPLETO (nome, empresa ou telefone).
//
// Por quê: a lista de Chats mostra só quem teve mensagem nos últimos 7 dias —
// senão a tela carregaria 900+ conversas inteiras a cada abertura. O efeito
// colateral era a agente procurar um cliente de duas semanas atrás, não achar
// nada e concluir que "o sistema não guarda histórico". As mensagens sempre
// estiveram no banco; faltava um jeito de pedir por elas.
//
// Visibilidade: igual à da tela de Chats — AGENT só encontra a própria
// carteira, ADMIN encontra todas (modo supervisão).
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim()
  if (q.length < 3) return NextResponse.json({ results: [] })

  const digits = q.replace(/\D/g, "")
  const rows = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      ...(me.role === "AGENT" ? { assignedUserId: me.id } : {}),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { empresa: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 3 ? [{ whatsappId: { contains: digits } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      name: true,
      empresa: true,
      whatsappId: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, mediaType: true, createdAt: true },
      },
    },
  })

  return NextResponse.json({
    results: rows.map((c) => {
      const last = c.messages[0]
      return {
        id: c.id,
        name: c.name,
        empresa: c.empresa,
        whatsappId: c.whatsappId,
        lastAt: last?.createdAt ?? c.updatedAt,
        lastBody: last ? (last.mediaType ? "📎 Mídia" : (last.body ?? "")) : "",
      }
    }),
  })
}

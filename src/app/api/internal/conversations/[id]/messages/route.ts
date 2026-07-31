import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// Confere se o usuário é membro da conversa. Retorna os ids dos membros.
async function assertMember(conversationId: string, userId: string): Promise<string[] | null> {
  const members = await prisma.internalConversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
  })
  if (!members.some((m) => m.userId === userId)) return null
  return members.map((m) => m.userId)
}

// ─── GET /api/internal/conversations/[id]/messages?before=<iso> ────────────────
// Últimas 50 mensagens (mais antigas → mais novas). `before` pagina p/ trás.
// Abrir a conversa marca como lida (atualiza lastReadAt do usuário).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const { id } = await params

  const memberIds = await assertMember(id, me.id)
  if (!memberIds) return NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 })

  const before = request.nextUrl.searchParams.get("before")
  const rows = await prisma.internalMessage.findMany({
    where: {
      conversationId: id,
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, senderId: true, body: true, mediaUrl: true, mediaType: true, createdAt: true },
  })

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.senderId))] } },
    select: { id: true, name: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.name]))

  // Marca como lida (abriu a conversa).
  await prisma.internalConversationMember.updateMany({
    where: { conversationId: id, userId: me.id },
    data: { lastReadAt: new Date() },
  })

  const messages = rows
    .reverse()
    .map((r) => ({
      id: r.id,
      senderId: r.senderId,
      senderName: nameById.get(r.senderId) ?? "?",
      fromMe: r.senderId === me.id,
      body: r.body,
      mediaUrl: r.mediaUrl,
      mediaType: r.mediaType,
      createdAt: r.createdAt,
    }))

  return NextResponse.json({ messages, hasMore: rows.length === 50 })
}

// ─── POST /api/internal/conversations/[id]/messages ───────────────────────────
// Envia uma mensagem (texto e/ou mídia) e emite em tempo real p/ os membros.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth
  const { id } = await params

  const memberIds = await assertMember(id, me.id)
  if (!memberIds) return NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 })

  let body: { body?: string; mediaUrl?: string; mediaType?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const text = (body.body ?? "").trim()
  const hasMedia = Boolean(body.mediaUrl && body.mediaType)
  if (!text && !hasMedia) {
    return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 })
  }

  const sender = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true } })

  const [msg] = await prisma.$transaction([
    prisma.internalMessage.create({
      data: {
        conversationId: id,
        senderId: me.id,
        body: text.slice(0, 5000),
        mediaUrl: hasMedia ? body.mediaUrl : null,
        mediaType: hasMedia ? body.mediaType : null,
      },
      select: { id: true, body: true, mediaUrl: true, mediaType: true, createdAt: true },
    }),
    // Bump da conversa (ordena a lista) + marca como lida pra quem enviou.
    prisma.internalConversation.update({ where: { id }, data: { updatedAt: new Date() } }),
    prisma.internalConversationMember.updateMany({
      where: { conversationId: id, userId: me.id },
      data: { lastReadAt: new Date() },
    }),
  ])

  const payload = {
    id: msg.id,
    conversationId: id,
    senderId: me.id,
    senderName: sender?.name ?? "?",
    body: msg.body,
    mediaUrl: msg.mediaUrl,
    mediaType: msg.mediaType,
    createdAt: msg.createdAt.toISOString(),
  }

  // Tempo real: entrega só aos membros da conversa.
  broadcastToUsers(memberIds, { type: "internal_message", data: payload })

  return NextResponse.json({ ...payload, fromMe: true }, { status: 201 })
}

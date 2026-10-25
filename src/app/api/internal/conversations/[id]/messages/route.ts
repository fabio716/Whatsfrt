import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"
import { sendPushToUsers } from "@/lib/push"
import { comprovanteValido } from "@/lib/comprovanteUpload"

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

// Até quando ESTE usuário "apagou a conversa" (clearedAt) — mensagens
// anteriores a isso ficam invisíveis pra ele (igual WhatsApp).
async function getMyClearedAt(conversationId: string, userId: string): Promise<Date | null> {
  const me = await prisma.internalConversationMember.findFirst({
    where: { conversationId, userId },
    select: { clearedAt: true },
  })
  return me?.clearedAt ?? null
}

// ─── GET /api/internal/conversations/[id]/messages?before=<iso> ────────────────
// Últimas 50 mensagens (mais antigas → mais novas). `before` pagina p/ trás.
// `desde=<iso>` traz TUDO a partir daquele instante — usado pela busca pra
// levar até uma mensagem antiga que ainda não estava carregada na tela.
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
  const desdeBruto = request.nextUrl.searchParams.get("desde")
  const desde = desdeBruto ? new Date(desdeBruto) : null
  if (desde && Number.isNaN(desde.getTime())) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 })
  }
  const clearedAt = await getMyClearedAt(id, me.id)
  // Filtros de data num objeto só. Antes eram dois spreads com a mesma chave
  // createdAt — com a conversa "apagada" (clearedAt), o segundo descartava o
  // `before` e "Carregar anteriores" trazia as mesmas 50 mensagens de novo.
  const createdAt: { lt?: Date; gt?: Date; gte?: Date } = {}
  if (desde) createdAt.gte = desde
  else if (before) createdAt.lt = new Date(before)
  if (clearedAt) createdAt.gt = clearedAt
  // Com `desde`, limite alto mas finito (é uma conversa só).
  const limite = desde ? 2000 : 50
  const rows = await prisma.internalMessage.findMany({
    where: {
      conversationId: id,
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: {
      id: true, senderId: true, body: true, mediaUrl: true, mediaType: true, createdAt: true,
      quotedMsgId: true, quotedBody: true, quotedSender: true,
      reactions: { select: { userId: true, emoji: true } },
    },
  })

  const userIds = new Set<string>()
  for (const r of rows) {
    userIds.add(r.senderId)
    for (const rx of r.reactions) userIds.add(rx.userId)
  }
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, photoUrl: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const photoById = new Map(users.map((u) => [u.id, u.photoUrl]))

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
      senderPhotoUrl: photoById.get(r.senderId) ?? null,
      fromMe: r.senderId === me.id,
      body: r.body,
      mediaUrl: r.mediaUrl,
      mediaType: r.mediaType,
      createdAt: r.createdAt,
      quotedMsgId: r.quotedMsgId,
      quotedBody: r.quotedBody,
      quotedSender: r.quotedSender,
      reactions: r.reactions.map((rx) => ({ userId: rx.userId, userName: nameById.get(rx.userId) ?? "?", emoji: rx.emoji })),
    }))

  // Com `desde`, "tem mais" = existe mensagem visível antes do ponto pedido.
  const hasMore = desde
    ? (await prisma.internalMessage.count({
        where: { conversationId: id, createdAt: { lt: desde, ...(clearedAt ? { gt: clearedAt } : {}) } },
      })) > 0
    : rows.length === limite
  return NextResponse.json({ messages, hasMore })
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

  let body: { body?: string; mediaUrl?: string; mediaType?: string; quotedMsgId?: string; comprovante?: string }
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
  // Arquivo só se foi esta pessoa que enviou (comprovante do upload). A
  // liberação de download (/api/media) confia em "existe mensagem interna
  // com este arquivo numa conversa minha" — sem esta checagem, bastava postar
  // o nome do anexo de OUTRA conversa numa conversa própria pra baixá-lo.
  if (hasMedia && !comprovanteValido(me.id, body.mediaUrl as string, body.comprovante)) {
    return NextResponse.json({ error: "Arquivo inválido. Anexe o arquivo de novo." }, { status: 400 })
  }

  const sender = await prisma.user.findUnique({ where: { id: me.id }, select: { name: true } })

  // Snapshot da mensagem citada (resposta em cima, igual WhatsApp).
  let quoted: { id: string; body: string; sender: string } | null = null
  if (body.quotedMsgId) {
    const q = await prisma.internalMessage.findFirst({
      where: { id: body.quotedMsgId, conversationId: id },
      select: { id: true, body: true, mediaType: true, senderId: true },
    })
    if (q) {
      const preview = q.body?.trim()
        || (q.mediaType?.startsWith("image/") ? "🖼️ Imagem"
          : q.mediaType?.startsWith("audio/") ? "🎤 Áudio"
          : q.mediaType?.startsWith("video/") ? "🎬 Vídeo"
          : q.mediaType ? "📎 Arquivo" : "")
      const qSenderName = q.senderId === me.id
        ? "Você"
        : (await prisma.user.findUnique({ where: { id: q.senderId }, select: { name: true } }))?.name ?? "?"
      quoted = { id: q.id, body: preview.slice(0, 300), sender: qSenderName }
    }
  }

  const [msg] = await prisma.$transaction([
    prisma.internalMessage.create({
      data: {
        conversationId: id,
        senderId: me.id,
        body: text.slice(0, 5000),
        mediaUrl: hasMedia ? body.mediaUrl : null,
        mediaType: hasMedia ? body.mediaType : null,
        ...(quoted ? { quotedMsgId: quoted.id, quotedBody: quoted.body, quotedSender: quoted.sender } : {}),
      },
      select: { id: true, body: true, mediaUrl: true, mediaType: true, createdAt: true, quotedMsgId: true, quotedBody: true, quotedSender: true },
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
    quotedMsgId: msg.quotedMsgId,
    quotedBody: msg.quotedBody,
    quotedSender: msg.quotedSender,
  }

  // Tempo real: entrega só aos membros da conversa.
  broadcastToUsers(memberIds, { type: "internal_message", data: payload })

  // Push real (navegador fechado) pros outros membros — não pra quem enviou.
  const pushTargets = memberIds.filter((uid) => uid !== me.id)
  void sendPushToUsers(pushTargets, {
    title: payload.senderName || "Mensagem interna",
    body: hasMedia ? "📎 Anexo" : payload.body,
    tag: `mensagens-${id}`,
    url: "/admin/mensagens",
  })

  return NextResponse.json({ ...payload, fromMe: true }, { status: 201 })
}

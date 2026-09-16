import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { broadcastToUsers } from "@/lib/sse-emitter"

export const dynamic = "force-dynamic"

// ─── Participantes de um grupo interno ───────────────────────────────────────
// POST   { userIds: [] } → adiciona gente num grupo JÁ CRIADO.
// DELETE ?userId=xxx     → remove um participante (ou sai do grupo).
// Só membros do grupo mexem na lista; DM (1:1) não aceita participante novo.

async function loadGroup(conversationId: string, meId: string) {
  const conv = await prisma.internalConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, isGroup: true, name: true,
      members: { select: { userId: true } },
    },
  })
  if (!conv) return { error: NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 }) }
  if (!conv.members.some((m) => m.userId === meId)) {
    return { error: NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 }) }
  }
  if (!conv.isGroup) {
    return { error: NextResponse.json({ error: "Conversa direta não aceita participantes" }, { status: 400 }) }
  }
  return { conv }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const loaded = await loadGroup(id, auth.id)
  if (loaded.error) return loaded.error
  const conv = loaded.conv

  let body: { userIds?: string[] }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const pedidos = Array.isArray(body.userIds) ? body.userIds : []
  if (pedidos.length === 0) return NextResponse.json({ error: "Selecione ao menos uma pessoa" }, { status: 400 })

  const jaMembro = new Set(conv.members.map((m) => m.userId))
  const validos = await prisma.user.findMany({
    where: { id: { in: pedidos }, isActive: true },
    select: { id: true, name: true },
  })
  const novos = validos.filter((u) => !jaMembro.has(u.id))
  if (novos.length === 0) {
    return NextResponse.json({ error: "Essas pessoas já participam do grupo" }, { status: 400 })
  }

  const eu = await prisma.user.findUnique({ where: { id: auth.id }, select: { name: true } })

  // Entra sem lastReadAt: quem chega vê o histórico do grupo (é conversa de
  // equipe, não carteira de cliente) e o aviso abaixo dá o contexto.
  await prisma.internalConversationMember.createMany({
    data: novos.map((u) => ({ conversationId: id, userId: u.id })),
    skipDuplicates: true,
  })

  // Mensagem de sistema no grupo — todo mundo vê quem entrou e quem adicionou.
  const aviso = await prisma.internalMessage.create({
    data: {
      conversationId: id,
      senderId: auth.id,
      body: `👥 ${eu?.name ?? "Alguém"} adicionou ${novos.map((u) => u.name).join(", ")} ao grupo.`,
    },
    select: { id: true, body: true, createdAt: true },
  })
  await prisma.internalConversation.update({ where: { id }, data: { updatedAt: new Date() } })

  const todos = [...jaMembro, ...novos.map((u) => u.id)]
  broadcastToUsers(todos, {
    type: "internal_message",
    data: {
      id: aviso.id,
      conversationId: id,
      senderId: auth.id,
      senderName: eu?.name ?? "?",
      body: aviso.body,
      mediaUrl: null,
      mediaType: null,
      createdAt: aviso.createdAt.toISOString(),
    },
  })

  return NextResponse.json({ added: novos.map((u) => ({ id: u.id, name: u.name })) }, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const loaded = await loadGroup(id, auth.id)
  if (loaded.error) return loaded.error
  const conv = loaded.conv

  const userId = request.nextUrl.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 })
  if (!conv.members.some((m) => m.userId === userId)) {
    return NextResponse.json({ error: "Essa pessoa não está no grupo" }, { status: 400 })
  }
  if (conv.members.length <= 2) {
    return NextResponse.json({ error: "Grupo precisa de pelo menos 2 participantes" }, { status: 400 })
  }

  const [eu, alvo] = await Promise.all([
    prisma.user.findUnique({ where: { id: auth.id }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ])

  await prisma.internalConversationMember.deleteMany({ where: { conversationId: id, userId } })

  const saiu = userId === auth.id
  const aviso = await prisma.internalMessage.create({
    data: {
      conversationId: id,
      senderId: auth.id,
      body: saiu
        ? `👋 ${eu?.name ?? "Alguém"} saiu do grupo.`
        : `👤 ${eu?.name ?? "Alguém"} removeu ${alvo?.name ?? "um participante"} do grupo.`,
    },
    select: { id: true, body: true, createdAt: true },
  })
  await prisma.internalConversation.update({ where: { id }, data: { updatedAt: new Date() } })

  const restantes = conv.members.map((m) => m.userId).filter((uid) => uid !== userId)
  broadcastToUsers(restantes, {
    type: "internal_message",
    data: {
      id: aviso.id,
      conversationId: id,
      senderId: auth.id,
      senderName: eu?.name ?? "?",
      body: aviso.body,
      mediaUrl: null,
      mediaType: null,
      createdAt: aviso.createdAt.toISOString(),
    },
  })

  return NextResponse.json({ removed: userId })
}

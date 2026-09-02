import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── GET /api/internal/conversations ──────────────────────────────────────────
// Lista as conversas internas do usuário logado, com preview da última mensagem
// e contagem de não lidas. Ordenadas pela mais recente.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  const myMemberships = await prisma.internalConversationMember.findMany({
    where: { userId: me.id },
    select: { conversationId: true, lastReadAt: true, archivedAt: true },
  })
  const convIds = myMemberships.map((m) => m.conversationId)
  if (convIds.length === 0) return NextResponse.json([])

  const lastReadByConv = new Map(myMemberships.map((m) => [m.conversationId, m.lastReadAt]))
  const archivedAtByConv = new Map(myMemberships.map((m) => [m.conversationId, m.archivedAt]))

  const [conversations, allMembers, lastMessages] = await Promise.all([
    prisma.internalConversation.findMany({
      where: { id: { in: convIds } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, isGroup: true, name: true, updatedAt: true },
    }),
    prisma.internalConversationMember.findMany({
      where: { conversationId: { in: convIds } },
      select: { conversationId: true, userId: true },
    }),
    // Última mensagem de cada conversa numa query só (distinct por conversa).
    prisma.internalMessage.findMany({
      where: { conversationId: { in: convIds } },
      orderBy: { createdAt: "desc" },
      distinct: ["conversationId"],
      select: { conversationId: true, senderId: true, body: true, mediaType: true, createdAt: true },
    }),
  ])

  // Resolve nomes de todos os usuários envolvidos numa query.
  const userIds = new Set<string>()
  for (const m of allMembers) userIds.add(m.userId)
  for (const lm of lastMessages) userIds.add(lm.senderId)
  const users = await prisma.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, photoUrl: true },
  })
  const nameById = new Map(users.map((u) => [u.id, u.name]))
  const photoById = new Map(users.map((u) => [u.id, u.photoUrl]))

  const membersByConv = new Map<string, string[]>()
  for (const m of allMembers) {
    const arr = membersByConv.get(m.conversationId) ?? []
    arr.push(m.userId)
    membersByConv.set(m.conversationId, arr)
  }
  const lastByConv = new Map(lastMessages.map((lm) => [lm.conversationId, lm]))

  // Contagem de não lidas por conversa (mensagens de outros após meu lastReadAt).
  const unreadCounts = await Promise.all(
    convIds.map(async (cid) => {
      const lr = lastReadByConv.get(cid) ?? null
      const count = await prisma.internalMessage.count({
        where: {
          conversationId: cid,
          senderId: { not: me.id },
          ...(lr ? { createdAt: { gt: lr } } : {}),
        },
      })
      return [cid, count] as const
    }),
  )
  const unreadByConv = new Map(unreadCounts)

  const result = conversations.map((c) => {
    const memberIds = membersByConv.get(c.id) ?? []
    const otherIds = memberIds.filter((id) => id !== me.id)
    // Nome exibido: grupo usa o nome; 1:1 usa o nome do outro participante.
    const displayName = c.isGroup
      ? (c.name ?? "Grupo")
      : (nameById.get(otherIds[0] ?? "") ?? "Conversa")
    // Foto: em 1:1, a foto do outro participante; em grupo, sem foto (ícone).
    const photoUrl = c.isGroup ? null : (photoById.get(otherIds[0] ?? "") ?? null)
    const lm = lastByConv.get(c.id)
    // Arquivada = marquei como arquivada E nada chegou depois disso —
    // mensagem nova faz a conversa reaparecer sozinha (igual WhatsApp).
    const archivedAt = archivedAtByConv.get(c.id)
    const archived = Boolean(archivedAt && (!lm || lm.createdAt <= archivedAt))
    return {
      archived,
      id: c.id,
      isGroup: c.isGroup,
      name: displayName,
      photoUrl,
      memberCount: memberIds.length,
      memberNames: memberIds.map((id) => nameById.get(id) ?? "?"),
      // Usado pro @menção no grupo — precisa do id de cada um, não só o nome.
      members: memberIds.map((id) => ({ id, name: nameById.get(id) ?? "?" })),
      updatedAt: c.updatedAt,
      unread: unreadByConv.get(c.id) ?? 0,
      lastMessage: lm
        ? {
            body: lm.body,
            mediaType: lm.mediaType,
            createdAt: lm.createdAt,
            senderName: nameById.get(lm.senderId) ?? "?",
            fromMe: lm.senderId === me.id,
          }
        : null,
    }
  })

  return NextResponse.json(result)
}

// ─── POST /api/internal/conversations ─────────────────────────────────────────
// Cria (ou reaproveita) uma conversa.
//   - { userId }               → conversa 1:1 (reaproveita se já existir)
//   - { name, memberIds: [] }  → grupo
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  let body: { userId?: string; name?: string; memberIds?: string[] }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  // ── Conversa 1:1 ──
  if (body.userId) {
    const otherId = body.userId
    if (otherId === me.id) {
      return NextResponse.json({ error: "Não é possível conversar consigo mesmo" }, { status: 400 })
    }
    const other = await prisma.user.findFirst({
      where: { id: otherId, isActive: true },
      select: { id: true },
    })
    if (!other) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })

    // Procura DM já existente entre os dois.
    const mine = await prisma.internalConversationMember.findMany({
      where: { userId: me.id },
      select: { conversationId: true },
    })
    const mineIds = mine.map((m) => m.conversationId)
    if (mineIds.length) {
      const shared = await prisma.internalConversationMember.findMany({
        where: { userId: otherId, conversationId: { in: mineIds } },
        select: { conversationId: true },
      })
      for (const s of shared) {
        const conv = await prisma.internalConversation.findUnique({
          where: { id: s.conversationId },
          select: { id: true, isGroup: true, _count: { select: { members: true } } },
        })
        if (conv && !conv.isGroup && conv._count.members === 2) {
          return NextResponse.json({ id: conv.id, isGroup: false }, { status: 200 })
        }
      }
    }

    const created = await prisma.internalConversation.create({
      data: {
        isGroup: false,
        createdById: me.id,
        members: { create: [{ userId: me.id, lastReadAt: new Date() }, { userId: otherId }] },
      },
      select: { id: true },
    })
    return NextResponse.json({ id: created.id, isGroup: false }, { status: 201 })
  }

  // ── Grupo ──
  const name = body.name?.trim()
  const memberIds = Array.isArray(body.memberIds) ? body.memberIds.filter((id) => id && id !== me.id) : []
  if (!name) return NextResponse.json({ error: "Nome do grupo é obrigatório" }, { status: 400 })
  if (memberIds.length === 0) return NextResponse.json({ error: "Selecione ao menos um participante" }, { status: 400 })

  const valid = await prisma.user.findMany({
    where: { id: { in: memberIds }, isActive: true },
    select: { id: true },
  })
  const uniqueIds = [...new Set([me.id, ...valid.map((u) => u.id)])]

  const created = await prisma.internalConversation.create({
    data: {
      isGroup: true,
      name: name.slice(0, 100),
      createdById: me.id,
      members: {
        create: uniqueIds.map((id) => ({ userId: id, lastReadAt: id === me.id ? new Date() : null })),
      },
    },
    select: { id: true },
  })
  return NextResponse.json({ id: created.id, isGroup: true }, { status: 201 })
}

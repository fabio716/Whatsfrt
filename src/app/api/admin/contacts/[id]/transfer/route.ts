import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { assignAgent } from "@/lib/serviceTracking"
import { broadcastToUsers } from "@/lib/sse-emitter"
import { sendPushToUsers } from "@/lib/push"

// POST /api/admin/contacts/[id]/transfer
//
// Transfere um contato pra outro agente. Aceita:
//   - { toMe: true }          → pra quem chamou (Trazer pra mim)
//   - { agentId: "..." }      → pra agente especifico
//
// Cria uma ServiceSession nova (zera o cronometro do "atendendo ha") e
// muda o assignedUserId + chatStatus=IN_SERVICE.
//
// Regras de quem pode:
//   - ADMIN: transfere qualquer contato pra qualquer agente/pra si.
//   - AGENT: transfere APENAS contato que ele mesmo esta atendendo
//     (evita agente "roubar" atendimento do colega). Nao pode 'toMe'
//     em contato de outro agente.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const { id } = await params

  let body: { agentId?: string; toMe?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo invalido" }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, name: true, assignedUserId: true },
  })
  if (!contact) {
    return NextResponse.json({ error: "Contato nao encontrado" }, { status: 404 })
  }

  // Ownership: AGENT so transfere contato proprio.
  if (session.role !== "ADMIN" && contact.assignedUserId !== session.id) {
    return NextResponse.json(
      { error: "Voce so pode transferir contatos que esta atendendo" },
      { status: 403 },
    )
  }

  let targetAgentId: string
  if (body.toMe) {
    targetAgentId = session.id
  } else if (body.agentId) {
    // Confirma que o agente alvo existe e esta ativo
    const agent = await prisma.user.findFirst({
      where: { id: body.agentId, isActive: true },
      select: { id: true, name: true },
    })
    if (!agent) {
      return NextResponse.json({ error: "Agente nao encontrado ou inativo" }, { status: 404 })
    }
    targetAgentId = agent.id
  } else {
    return NextResponse.json({ error: "Informe agentId ou toMe=true" }, { status: 400 })
  }

  // Usa o mesmo helper que normalmente assume — cria session, seta IN_SERVICE
  await assignAgent(id, targetAgentId)

  // Avisa em tempo real quem recebeu e quem passou. Sem isso a conversa só
  // aparecia pra nova vendedora no próximo F5 — a equipe relatou "até 20
  // minutos", que era só o tempo até alguém recarregar a página por acaso.
  const anterior = contact.assignedUserId ?? null
  const envolvidos = [targetAgentId, ...(anterior && anterior !== targetAgentId ? [anterior] : [])]
  broadcastToUsers(envolvidos, {
    type: "contact_transfer",
    data: {
      contactId: id,
      contactName: contact.name ?? "Cliente",
      toUserId: targetAgentId,
      fromUserId: anterior,
      byName: session.name,
    },
  })

  // Push real (navegador fechado) só pra quem recebeu — quem passou já sabe.
  if (targetAgentId !== session.id) {
    void sendPushToUsers([targetAgentId], {
      title: `${contact.name ?? "Cliente"} é sua agora`,
      body: `${session.name} transferiu esta conversa pra você.`,
      tag: `transfer-${id}`,
      url: `/admin/chats?contact=${id}`,
    })
  }

  return NextResponse.json({
    ok: true,
    contactId: id,
    assignedUserId: targetAgentId,
    previousUserId: contact.assignedUserId,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { assignAgent } from "@/lib/serviceTracking"

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

  return NextResponse.json({
    ok: true,
    contactId: id,
    assignedUserId: targetAgentId,
    previousUserId: contact.assignedUserId,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { assignAgent } from "@/lib/serviceTracking"

// POST /api/admin/contacts/[id]/transfer
//
// Admin transfere um contato pra:
//   - { toMe: true }          → pro próprio admin (Trazer pra mim)
//   - { agentId: "..." }      → pro agente específico
//
// Cria uma ServiceSession nova (zera o cronômetro do "atendendo há") e
// muda o assignedUserId + chatStatus=IN_SERVICE.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const { id } = await params

  let body: { agentId?: string; toMe?: boolean }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  let targetAgentId: string
  if (body.toMe) {
    targetAgentId = session.id
  } else if (body.agentId) {
    // Confirma que o agente alvo existe e está ativo
    const agent = await prisma.user.findFirst({
      where: { id: body.agentId, isActive: true },
      select: { id: true, name: true },
    })
    if (!agent) {
      return NextResponse.json({ error: "Agente não encontrado ou inativo" }, { status: 404 })
    }
    targetAgentId = agent.id
  } else {
    return NextResponse.json({ error: "Informe agentId ou toMe=true" }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, name: true, assignedUserId: true },
  })
  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
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

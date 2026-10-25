import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { assignAgent } from "@/lib/serviceTracking"
import { ChatStatus } from "@/generated/prisma/enums"

// ─── POST /api/admin/contacts/[id]/assign — "Assumir atendimento" ─────────────
// Admin assume qualquer contato. Agente só pode assumir:
//   - contato que já é dele;
//   - contato SEM dono na fila (URA/aguardando), do setor dele ou sem setor
//     (mesma regra da tela Fila de espera);
//   - contato sem dono que ELE atendeu por último (botão "Assumir" do Chats).
// Antes não havia checagem nenhuma: qualquer agente tomava na hora o cliente
// que estava em atendimento com outro, sem registro e sem aviso. Pra cliente
// de outro vendedor existe o "Requisitar", que registra a transferência.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const session = auth

  const { id } = await params

  const contact = await prisma.contact.findUnique({ where: { id } })
  if (!contact || contact.deletedAt) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  if (session.role === "AGENT" && contact.assignedUserId !== session.id) {
    if (contact.assignedUserId) {
      return NextResponse.json(
        { error: "Este cliente está em atendimento com outro vendedor. Use \"Requisitar\" para pedir a transferência." },
        { status: 403 },
      )
    }
    const naFila = contact.chatStatus === ChatStatus.WAITING_AGENT || contact.chatStatus === ChatStatus.IN_URA
    let setorOk = !contact.pendingDepartment
    if (!setorOk) {
      const eu = await prisma.user.findUnique({ where: { id: session.id }, select: { department: true } })
      setorOk = eu?.department === contact.pendingDepartment
    }
    const atendeuPorUltimo = contact.lastAgentUserId === session.id
    if (!((naFila && setorOk) || atendeuPorUltimo)) {
      return NextResponse.json({ error: "Você não pode assumir este cliente." }, { status: 403 })
    }
  }

  // Cria ServiceSession + marca inServiceSince + chatStatus=IN_SERVICE.
  await assignAgent(id, session.id)

  return NextResponse.json({
    assignedUserId: session.id,
    chatStatus: "IN_SERVICE",
  })
}

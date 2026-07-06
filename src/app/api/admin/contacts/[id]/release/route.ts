import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { ChatStatus } from "@/generated/prisma/enums"

// Liberar contato — devolve pro estado IDLE. Usado em 2 casos:
// 1) Contato ficou "colado" num agente (ex: admin atendeu pra testar e nao
//    encerrou com nota) — sem isso a URA nao dispara na proxima mensagem.
// 2) Admin quer forcar o cliente a voltar pelo menu da URA (reescolher setor).
//
// Efeito:
//   assignedUserId=null, chatStatus=IDLE, pendingDepartment=null,
//   waitingAgentSince=null, inServiceSince=null
//   + encerra ServiceSession ativa se existir (marca como autoEnded).
//
// Nao apaga mensagens nem cria pedido de nota. Cliente nao recebe aviso.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const { id } = await params

  const contact = await prisma.contact.findUnique({ where: { id } })
  if (!contact) {
    return NextResponse.json({ error: "Contato nao encontrado" }, { status: 404 })
  }

  // Encerra qualquer session ativa (silenciosa, sem pedir nota).
  const active = await prisma.serviceSession.findFirst({
    where: { contactId: id, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  })
  if (active) {
    await prisma.serviceSession.update({
      where: { id: active.id },
      data: { endedAt: new Date(), autoEnded: true },
    })
  }

  await prisma.contact.update({
    where: { id },
    data: {
      chatStatus: ChatStatus.IDLE,
      assignedUserId: null,
      pendingDepartment: null,
      waitingAgentSince: null,
      inServiceSince: null,
    },
  })

  return NextResponse.json({ ok: true, contactId: id })
}

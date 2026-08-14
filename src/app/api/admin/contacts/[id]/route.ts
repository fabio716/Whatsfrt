import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME, requireSession, isErrorResponse } from "@/lib/auth"
import { normalizePhone } from "@/lib/contactImport"

interface EditBody {
  name?: string
  phone?: string
  empresa?: string | null
  cidade?: string | null
}

// PATCH /api/admin/contacts/[id] — corrige nome/telefone/empresa/cidade de um
// contato. Aberto pra ADMIN e AGENT (a tela de Contatos é compartilhada, não
// por carteira — ver GET em /api/admin/contacts). Trocar o telefone NÃO
// apaga histórico: as mensagens ficam ligadas ao Contact (id), não ao
// whatsappId — só o próximo envio passa a ir pro número novo.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  let body: EditBody
  try {
    body = (await request.json()) as EditBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const contact = await prisma.contact.findUnique({ where: { id, deletedAt: null } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  const data: Record<string, unknown> = {}

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: "Nome não pode ficar vazio" }, { status: 400 })
    data.name = name
  }

  if (body.phone !== undefined) {
    const whatsappId = normalizePhone(body.phone.trim())
    if (!whatsappId) {
      return NextResponse.json({ error: "Telefone inválido. Use DDD + número (ex: 11 99999-9999)" }, { status: 422 })
    }
    if (whatsappId !== contact.whatsappId) {
      const conflict = await prisma.contact.findUnique({ where: { whatsappId }, select: { id: true, name: true } })
      if (conflict && conflict.id !== id) {
        return NextResponse.json({ error: `Esse telefone já está cadastrado em outro contato: ${conflict.name}` }, { status: 409 })
      }
      data.whatsappId = whatsappId
    }
  }

  if (body.empresa !== undefined) data.empresa = body.empresa?.trim() || null
  if (body.cidade !== undefined) data.cidade = body.cidade?.trim() || null

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 })
  }

  const updated = await prisma.contact.update({
    where: { id },
    data,
    select: { id: true, name: true, whatsappId: true, empresa: true, cidade: true },
  })

  return NextResponse.json(updated)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const session = await verifySessionToken(token)
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  }

  const { id } = await params

  const contact = await prisma.contact.findUnique({ where: { id } })
  if (!contact) {
    return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })
  }

  await prisma.message.deleteMany({ where: { contactId: id } })
  await prisma.campaignLog.deleteMany({ where: { contactId: id } })
  await prisma.uraSession.deleteMany({ where: { whatsappId: contact.whatsappId } })
  await prisma.contact.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

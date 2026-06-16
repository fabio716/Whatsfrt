import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"

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

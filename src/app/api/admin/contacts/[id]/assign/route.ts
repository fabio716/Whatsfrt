import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import { assignAgent } from "@/lib/serviceTracking"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const session = await verifySessionToken(token)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params

  const contact = await prisma.contact.findUnique({ where: { id } })
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 })

  // Cria ServiceSession + marca inServiceSince + chatStatus=IN_SERVICE.
  await assignAgent(id, session.id)

  return NextResponse.json({
    assignedUserId: session.id,
    chatStatus: "IN_SERVICE",
  })
}

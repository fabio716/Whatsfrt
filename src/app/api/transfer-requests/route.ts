import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// GET /api/transfer-requests
// Retorna:
//   incoming — solicitações PENDENTES que EU posso aprovar (sou o dono atual,
//              ou sou admin → vejo todas).
//   outgoing — solicitações que EU fiz (como solicitante), com o status.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  const [incoming, outgoing] = await Promise.all([
    prisma.contactTransferRequest.findMany({
      where: {
        status: "PENDING",
        ...(me.role === "ADMIN" ? {} : { fromUserId: me.id }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.contactTransferRequest.findMany({
      where: { requesterId: me.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ])

  return NextResponse.json({ incoming, outgoing })
}

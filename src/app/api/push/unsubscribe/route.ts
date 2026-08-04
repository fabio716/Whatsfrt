import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// POST /api/push/unsubscribe — remove a subscription de push do navegador
// atual (usuário desativou notificações, ou logout).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null
  const endpoint = body?.endpoint
  if (!endpoint) return NextResponse.json({ error: "endpoint obrigatório" }, { status: 400 })

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: me.id } })

  return NextResponse.json({ ok: true })
}

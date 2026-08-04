import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

interface SubscribeBody {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

// POST /api/push/subscribe — salva a subscription de push do navegador atual
// pro usuário logado. Chamado depois que o Service Worker registra o push.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const me = auth

  const body = (await request.json().catch(() => null)) as SubscribeBody | null
  const endpoint = body?.endpoint
  const p256dh = body?.keys?.p256dh
  const authKey = body?.keys?.auth
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: "Subscription inválida" }, { status: 400 })
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: me.id, endpoint, p256dh, auth: authKey },
    update: { userId: me.id, p256dh, auth: authKey },
  })

  return NextResponse.json({ ok: true })
}

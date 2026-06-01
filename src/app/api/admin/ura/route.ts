import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"
import { getOrCreateUraConfig, invalidateUraCache } from "@/lib/ura"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })
  const config = await getOrCreateUraConfig()
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const body = (await request.json()) as {
    greetingText?:       string
    isActive?:           boolean
    outOfOfficeMessage?: string
    lunchMessage?:       string
  }

  // getOrCreateUraConfig guarantees a row exists; upsert is a safe-guard
  // in case the singleton was deleted between the GET and this PUT.
  const config = await getOrCreateUraConfig()

  const patch: Record<string, unknown> = {}
  if (body.greetingText       !== undefined) patch.greetingText       = body.greetingText
  if (body.isActive           !== undefined) patch.isActive           = body.isActive
  if (body.outOfOfficeMessage !== undefined) patch.outOfOfficeMessage = body.outOfOfficeMessage
  if (body.lunchMessage       !== undefined) patch.lunchMessage       = body.lunchMessage

  const updated = await prisma.uraConfig.upsert({
    where:  { id: config.id },
    update: patch,
    create: { greetingText: body.greetingText ?? "", isActive: body.isActive ?? false },
    include: {
      options:       { orderBy: { order: "asc" } },
      businessHours: { orderBy: { dayOfWeek: "asc" } },
    },
  })

  invalidateUraCache()
  return NextResponse.json(updated)
}

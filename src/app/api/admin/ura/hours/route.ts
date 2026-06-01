import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"
import { getOrCreateUraConfig, invalidateUraCache } from "@/lib/ura"

interface HourRow {
  dayOfWeek:     number
  isClosed:      boolean
  openTime:      string
  closeTime:     string
  hasLunchBreak: boolean
  lunchStart:    string
  lunchEnd:      string
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const body = (await request.json()) as { hours?: HourRow[] }
  if (!Array.isArray(body.hours) || body.hours.length !== 7) {
    return NextResponse.json({ error: "Esperado array com exatamente 7 dias (0–6)" }, { status: 400 })
  }

  const { id: configId } = await getOrCreateUraConfig()

  await prisma.$transaction(
    body.hours.map((h) =>
      prisma.businessHour.upsert({
        where:  { configId_dayOfWeek: { configId, dayOfWeek: h.dayOfWeek } },
        update: {
          isClosed:      h.isClosed,
          openTime:      h.openTime,
          closeTime:     h.closeTime,
          hasLunchBreak: h.hasLunchBreak,
          lunchStart:    h.lunchStart,
          lunchEnd:      h.lunchEnd,
        },
        create: {
          configId,
          dayOfWeek:     h.dayOfWeek,
          isClosed:      h.isClosed,
          openTime:      h.openTime,
          closeTime:     h.closeTime,
          hasLunchBreak: h.hasLunchBreak,
          lunchStart:    h.lunchStart,
          lunchEnd:      h.lunchEnd,
        },
      })
    )
  )

  invalidateUraCache()
  return NextResponse.json({ ok: true })
}

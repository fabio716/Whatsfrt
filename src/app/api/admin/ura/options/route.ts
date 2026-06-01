import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"
import { getOrCreateUraConfig, invalidateUraCache } from "@/lib/ura"

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const body = (await request.json()) as {
    digit?: string
    label?: string
    targetDepartment?: string
    order?: number
  }

  if (!body.digit || !body.label || !body.targetDepartment) {
    return NextResponse.json({ error: "digit, label e targetDepartment são obrigatórios" }, { status: 400 })
  }

  // Obtain (or create) singleton before building transaction
  const { id: configId } = await getOrCreateUraConfig()

  // Both operations run atomically: upsert guarantees the config row exists
  // before the FK-referencing create, eliminating any constraint violation.
  const [, option] = await prisma.$transaction([
    prisma.uraConfig.upsert({
      where:  { id: configId },
      update: {},
      create: { greetingText: "", isActive: false },
    }),
    prisma.uraMenuOption.create({
      data: {
        digit:            body.digit,
        label:            body.label,
        targetDepartment: body.targetDepartment,
        order:            body.order ?? 0,
        configId,
      },
    }),
  ])

  invalidateUraCache()
  return NextResponse.json(option, { status: 201 })
}

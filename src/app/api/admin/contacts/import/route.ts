import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"
import { importContactsFromCsv } from "@/lib/contactImport"

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const file   = formData.get("file")   as File   | null
  const userId = (formData.get("userId") as string | null) || null
  const cooperativeId = (formData.get("cooperativeId") as string | null) || null

  if (!file) {
    return NextResponse.json({ error: "file é obrigatório" }, { status: 400 })
  }

  let agent: { name: string } | null = null
  if (userId) {
    agent = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, isActive: true } })
    if (!agent || !(agent as { name: string; isActive: boolean }).isActive) {
      return NextResponse.json({ error: "Agente não encontrado ou inativo" }, { status: 404 })
    }
  }

  const csvText = await file.text()
  const result = await importContactsFromCsv(csvText, { assignedUserId: userId, cooperativeId })

  if ("error" in result) {
    return NextResponse.json({ error: result.error, details: result.details }, { status: result.status })
  }

  return NextResponse.json({ ...result, agentName: agent?.name ?? null }, { status: 201 })
}

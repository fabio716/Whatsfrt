import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "@/lib/auth"
import { importContactsFromCsv } from "@/lib/contactImport"

// POST /api/contacts/import — import contacts for the logged-in user.
// Agents always import contacts assigned to themselves. Admins may target
// another user via the optional `userId` field.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 })

  const isAgent = session.role === "AGENT"
  const requestedUserId = (formData.get("userId") as string | null) || null
  // Agents can never assign to anyone but themselves.
  const assignedUserId = isAgent ? session.id : (requestedUserId ?? session.id)
  const cooperativeId = (formData.get("cooperativeId") as string | null) || null

  const csvText = await file.text()
  const result = await importContactsFromCsv(csvText, { assignedUserId, cooperativeId })

  if ("error" in result) {
    return NextResponse.json({ error: result.error, details: result.details }, { status: result.status })
  }

  return NextResponse.json(result, { status: 201 })
}

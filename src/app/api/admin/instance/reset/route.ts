import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

/**
 * POST /api/admin/instance/reset
 *
 * Body (JSON, all optional):
 *   { clearData?: boolean }   — if true, deletes all Messages and Contacts from DB
 *
 * Actions:
 *  1. Calls Evolution API DELETE /instance/delete/{instance} to destroy the WA session.
 *  2. Optionally truncates messages + contacts tables for a clean slate.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as { clearData?: boolean }

  const apiUrl   = process.env.EVOLUTION_API_URL
  const apiKey   = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json(
      { error: "Variáveis EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE_NAME não configuradas" },
      { status: 500 }
    )
  }

  // ── 1. Delete Evolution instance (disconnects + removes WA session) ──────────
  let evolutionStatus: number | null = null
  let evolutionBody: unknown = null

  try {
    const evoRes = await fetch(`${apiUrl}/instance/delete/${instance}`, {
      method:  "DELETE",
      headers: { apikey: apiKey },
    })
    evolutionStatus = evoRes.status
    evolutionBody   = await evoRes.json().catch(() => null)
  } catch (err) {
    console.error("[instance/reset] Evolution DELETE failed:", err)
    return NextResponse.json(
      { error: "Falha ao contatar a Evolution API", details: String(err) },
      { status: 502 }
    )
  }

  // ── 2. Optionally wipe Messages + Contacts from DB ───────────────────────────
  let dbResult: { deletedMessages: number; deletedContacts: number } | null = null

  if (body.clearData) {
    const [msgResult, ctcResult] = await prisma.$transaction([
      prisma.message.deleteMany({}),
      prisma.contact.deleteMany({}),
    ])
    dbResult = {
      deletedMessages: msgResult.count,
      deletedContacts: ctcResult.count,
    }
    console.log("[instance/reset] DB cleared:", dbResult)
  }

  console.log(`[instance/reset] Evolution responded ${evolutionStatus ?? "?"}`)

  return NextResponse.json({
    evolution: { status: evolutionStatus, body: evolutionBody },
    db:        dbResult ?? "skipped (clearData not set)",
  })
}

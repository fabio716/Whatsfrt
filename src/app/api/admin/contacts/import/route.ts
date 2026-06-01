import { NextRequest, NextResponse } from "next/server"
import Papa from "papaparse"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// ─── Phone normalizer ─────────────────────────────────────────────────────────
// Converts any Brazilian number to international WhatsApp JID format.
// Supported inputs: +55 11 99999-9999, 5511999999999, 11999999999, etc.

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null

  let number = digits

  // Already has DDI 55 → 12 (landline) or 13 (mobile with 9) digits
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    number = digits
  } else if (digits.length === 11 || digits.length === 10) {
    // DDD + number without DDI
    number = `55${digits}`
  } else if (digits.length === 9 || digits.length === 8) {
    // No DDD at all — skip
    return null
  } else {
    // Other lengths: try to use as-is if reasonable
    if (digits.length < 10) return null
    number = digits.startsWith("55") ? digits : `55${digits}`
  }

  return `${number}@s.whatsapp.net`
}

// ─── Column name aliases ──────────────────────────────────────────────────────

function findCol(headers: string[], aliases: string[]): string | undefined {
  return headers.find((h) => aliases.includes(h.toLowerCase().trim().normalize("NFD").replace(/\p{M}/gu, "")))
}

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

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (parsed.errors.length && !parsed.data.length) {
    return NextResponse.json({ error: "CSV inválido", details: parsed.errors }, { status: 422 })
  }

  const headers = parsed.meta.fields ?? []

  const nameCol  = findCol(headers, ["nome",  "name",   "contato", "cliente"])
  const phoneCol = findCol(headers, [
    "telefone", "phone", "celular", "cel", "whatsapp",
    "numero",   "fone",  "mobile",  "tel",
  ])

  if (!nameCol || !phoneCol) {
    return NextResponse.json({
      error: `Colunas não encontradas. Esperado: nome + telefone. Encontrado: ${headers.join(", ")}`,
    }, { status: 422 })
  }

  // ── Build upsert list ───────────────────────────────────────────────────────
  type Row = { whatsappId: string; name: string }
  const rows: Row[] = []
  const skipped: string[] = []

  for (const record of parsed.data) {
    const rawName  = record[nameCol]?.trim()
    const rawPhone = record[phoneCol]?.trim()
    if (!rawName || !rawPhone) continue
    const jid = normalizePhone(rawPhone)
    if (!jid) { skipped.push(rawPhone); continue }
    rows.push({ whatsappId: jid, name: rawName })
  }

  if (!rows.length) {
    return NextResponse.json({ error: "Nenhum contato válido encontrado no CSV", skipped }, { status: 422 })
  }

  // ── Bulk upsert in a transaction (batches of 100) ───────────────────────────
  let created = 0
  let updated = 0

  const BATCH = 100
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await prisma.$transaction(
      batch.map((r) =>
        prisma.contact.upsert({
          where: { whatsappId: r.whatsappId },
          create: {
            whatsappId: r.whatsappId,
            name: r.name,
            assignedUserId: userId,
            chatStatus: "IDLE",
          },
          update: {
            name: r.name,
            assignedUserId: userId,
          },
        })
      )
    ).then((results) => {
      // Count based on whether the record existed (updatedAt === createdAt → new)
      for (const r of results) {
        const isNew = r.createdAt.getTime() === r.updatedAt.getTime()
        if (isNew) created++; else updated++
      }
    })
  }

  return NextResponse.json({
    success: true,
    total: rows.length,
    created,
    updated,
    skipped: skipped.length,
    skippedNumbers: skipped,
    agentName: agent?.name ?? null,
  }, { status: 201 })
}

import Papa from "papaparse"
import { prisma } from "@/lib/prisma"

// ─── Phone normalizer ─────────────────────────────────────────────────────────
// Converts any Brazilian number to international WhatsApp JID format.
// Supported inputs: +55 11 99999-9999, 5511999999999, 11999999999, etc.
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "")
  if (!digits) return null

  let number = digits

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    number = digits
  } else if (digits.length === 11 || digits.length === 10) {
    number = `55${digits}`
  } else if (digits.length === 9 || digits.length === 8) {
    return null
  } else {
    if (digits.length < 10) return null
    number = digits.startsWith("55") ? digits : `55${digits}`
  }

  return `${number}@s.whatsapp.net`
}

function findCol(headers: string[], aliases: string[]): string | undefined {
  return headers.find((h) => aliases.includes(h.toLowerCase().trim().normalize("NFD").replace(/\p{M}/gu, "")))
}

export interface ImportResult {
  success: boolean
  total: number
  created: number
  updated: number
  skipped: number
  skippedNumbers: string[]
}

export type ImportError = { error: string; status: number; details?: unknown }

// Parses a CSV file and upserts contacts, assigning them to the given user.
// Returns either an ImportResult or an ImportError (with HTTP status).
export async function importContactsFromCsv(
  csvText: string,
  opts: { assignedUserId: string | null; cooperativeId: string | null },
): Promise<ImportResult | ImportError> {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  if (parsed.errors.length && !parsed.data.length) {
    return { error: "CSV inválido", status: 422, details: parsed.errors }
  }

  const headers = parsed.meta.fields ?? []

  const nameCol = findCol(headers, ["nome", "name", "contato", "cliente"])
  const phoneCol = findCol(headers, [
    "telefone", "phone", "celular", "cel", "whatsapp",
    "numero", "fone", "mobile", "tel",
    "phone 1 - value", "phone 2 - value", "phone 3 - value",
  ])

  const firstNameCol = findCol(headers, ["first name", "nome"])
  const middleNameCol = findCol(headers, ["middle name"])
  const lastNameCol = findCol(headers, ["last name", "sobrenome"])

  if (!phoneCol) {
    return {
      error: `Coluna de telefone não encontrada. Esperado: telefone, phone, celular, etc. Encontrado: ${headers.join(", ")}`,
      status: 422,
    }
  }

  type Row = { whatsappId: string; name: string }
  const rows: Row[] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  for (const record of parsed.data) {
    let rawName = ""
    if (nameCol && record[nameCol]?.trim()) {
      rawName = record[nameCol].trim()
    } else if (firstNameCol || lastNameCol) {
      const parts = [
        record[firstNameCol || ""]?.trim(),
        record[middleNameCol || ""]?.trim(),
        record[lastNameCol || ""]?.trim(),
      ].filter(Boolean)
      rawName = parts.join(" ")
    }

    const rawPhone = record[phoneCol]?.trim()
    if (!rawName || !rawPhone) continue
    const jid = normalizePhone(rawPhone)
    if (!jid) { skipped.push(rawPhone); continue }
    if (seen.has(jid)) continue
    seen.add(jid)
    rows.push({ whatsappId: jid, name: rawName })
  }

  if (!rows.length) {
    return { error: "Nenhum contato válido encontrado no CSV", status: 422 }
  }

  let created = 0
  let updated = 0

  const BATCH = 100
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const results = await prisma.$transaction(
      batch.map((r) =>
        prisma.contact.upsert({
          where: { whatsappId: r.whatsappId },
          create: {
            whatsappId: r.whatsappId,
            name: r.name,
            assignedUserId: opts.assignedUserId,
            ...(opts.cooperativeId ? { cooperativeId: opts.cooperativeId } : {}),
            chatStatus: "IDLE",
          },
          update: {
            name: r.name,
            assignedUserId: opts.assignedUserId,
            ...(opts.cooperativeId ? { cooperativeId: opts.cooperativeId } : {}),
            chatStatus: "IDLE",
          },
        }),
      ),
    )
    for (const r of results) {
      const isNew = r.createdAt.getTime() === r.updatedAt.getTime()
      if (isNew) created++; else updated++
    }
  }

  return {
    success: true,
    total: rows.length,
    created,
    updated,
    skipped: skipped.length,
    skippedNumbers: skipped,
  }
}

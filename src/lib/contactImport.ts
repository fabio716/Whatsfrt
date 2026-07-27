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
  // Contatos que já existiam na base e foram MANTIDOS como estavam
  // (dono/carteira preservado). A importação nunca sobrescreve existentes.
  existing: number
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

  // Campos comerciais opcionais — não bloqueiam import se ausentes
  const empresaCol = findCol(headers, ["empresa", "company", "organizacao", "organization", "company name"])
  const cidadeCol = findCol(headers, ["cidade", "city", "municipio", "localidade"])

  if (!phoneCol) {
    return {
      error: `Coluna de telefone não encontrada. Esperado: telefone, phone, celular, etc. Encontrado: ${headers.join(", ")}`,
      status: 422,
    }
  }

  type Row = { whatsappId: string; name: string; empresa: string | null; cidade: string | null }
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

    const empresa = empresaCol ? (record[empresaCol]?.trim() ?? null) : null
    const cidade = cidadeCol ? (record[cidadeCol]?.trim() ?? null) : null
    rows.push({
      whatsappId: jid, name: rawName,
      empresa: empresa && empresa.length > 0 ? empresa.slice(0, 200) : null,
      cidade: cidade && cidade.length > 0 ? cidade.slice(0, 100) : null,
    })
  }

  if (!rows.length) {
    return { error: "Nenhum contato válido encontrado no CSV", status: 422 }
  }

  // Importação é ADITIVA: só insere números que ainda NÃO existem na base.
  // Contatos já existentes são deixados exatamente como estão — o dono/carteira
  // (assignedUserId) NUNCA é sobrescrito, evitando que uma importação "roube"
  // clientes de outro vendedor. Para trazer um cliente já existente para a
  // própria carteira existe a ação explícita "Requisitar cliente".
  // A deduplicação dentro do arquivo já foi feita acima (Set `seen`); aqui o
  // skipDuplicates cobre os que já estão no banco (whatsappId é @unique).
  let created = 0

  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const res = await prisma.contact.createMany({
      data: batch.map((r) => ({
        whatsappId: r.whatsappId,
        name: r.name,
        empresa: r.empresa,
        cidade: r.cidade,
        assignedUserId: opts.assignedUserId,
        ...(opts.cooperativeId ? { cooperativeId: opts.cooperativeId } : {}),
        chatStatus: "IDLE" as const,
      })),
      skipDuplicates: true,
    })
    created += res.count
  }

  return {
    success: true,
    total: rows.length,
    created,
    // Tudo que estava no CSV (válido) e não foi criado é porque já existia.
    existing: rows.length - created,
    skipped: skipped.length,
    skippedNumbers: skipped,
  }
}

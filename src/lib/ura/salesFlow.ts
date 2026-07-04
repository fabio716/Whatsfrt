// ═══════════════════════════════════════════════════════════════════════════
// Fluxo Vendas com roteamento geografico. Quando o cliente escolhe "Vendas"
// na URA a gente pergunta o estado (UF) antes de rotear pra vendedora, pra
// nao mandar um lead do RS pra vendedora que atende SP.
//
// Estado "esperando UF" fica no Redis com TTL curto — se o cliente sumir
// ou digitar besteira 15min, a URA reseta e ele reinicia o menu.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { ChatStatus } from "@/generated/prisma/enums"

const AWAITING_UF_TTL_SECONDS = 15 * 60
const awaitingUfKey = (whatsappId: string): string => `ura:awaiting-uf:${whatsappId}`

export async function markAwaitingUf(whatsappId: string): Promise<void> {
  await redis.setex(awaitingUfKey(whatsappId), AWAITING_UF_TTL_SECONDS, "1")
}

export async function isAwaitingUf(whatsappId: string): Promise<boolean> {
  const v = await redis.get(awaitingUfKey(whatsappId))
  return v === "1"
}

export async function clearAwaitingUf(whatsappId: string): Promise<void> {
  await redis.del(awaitingUfKey(whatsappId))
}

// Nomes completos de estados → UF. Aceita variacao com/sem acento
// pra nao penalizar quem digita "sao paulo".
const STATE_NAMES: Record<string, string> = {
  "acre": "AC",
  "alagoas": "AL",
  "amapa": "AP",
  "amazonas": "AM",
  "bahia": "BA",
  "ceara": "CE",
  "distrito federal": "DF",
  "df": "DF",
  "brasilia": "DF",
  "espirito santo": "ES",
  "goias": "GO",
  "maranhao": "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  "para": "PA",
  "paraiba": "PB",
  "parana": "PR",
  "pernambuco": "PE",
  "piaui": "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  "rondonia": "RO",
  "roraima": "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  "sergipe": "SE",
  "tocantins": "TO",
}

const VALID_UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO",
])

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

export function parseUf(text: string): string | null {
  const raw = text.trim()
  if (!raw) return null

  // Caso 1: sigla direta (2 letras)
  const asUf = raw.toUpperCase().replace(/[^A-Z]/g, "")
  if (asUf.length === 2 && VALID_UFS.has(asUf)) return asUf

  // Caso 2: nome completo
  const norm = normalize(raw)
  if (STATE_NAMES[norm]) return STATE_NAMES[norm]

  // Caso 3: nome dentro de frase ("moro em sao paulo", "sou de minas gerais")
  for (const [name, uf] of Object.entries(STATE_NAMES)) {
    if (norm.includes(name)) return uf
  }

  return null
}

// Dado uma UF, acha o Territory + escolhe a vendedora menos carregada
// (menos IN_SERVICE agora). Retorna null se ninguem cobre aquela UF ou se
// o territorio esta desativado — quem chama decide fallback (VENDAS geral).
export async function pickAgentForUf(uf: string): Promise<string | null> {
  const territory = await prisma.territory.findUnique({ where: { uf } })
  if (!territory || !territory.isActive) return null
  if (territory.assignedUserIds.length === 0) return null

  const users = await prisma.user.findMany({
    where: {
      id: { in: territory.assignedUserIds },
      role: "AGENT",
      isActive: true,
    },
    select: {
      id: true,
      _count: { select: { assignedContacts: { where: { chatStatus: ChatStatus.IN_SERVICE } } } },
    },
  })

  if (users.length === 0) return null
  users.sort((a, b) => a._count.assignedContacts - b._count.assignedContacts)
  return users[0].id
}

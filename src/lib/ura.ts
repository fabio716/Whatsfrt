import { prisma } from "@/lib/prisma"

// ─── Singleton helper ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const INCLUDE_FULL = {
  options:       { orderBy: { order: "asc" as const } },
  businessHours: { orderBy: { dayOfWeek: "asc" as const } },
}

const DEFAULT_BIZ_HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  dayOfWeek:     d,
  isClosed:      d === 0 || d === 6,
  openTime:      "08:00",
  closeTime:     "18:00",
  hasLunchBreak: d > 0 && d < 6,
  lunchStart:    "12:00",
  lunchEnd:      "13:00",
}))

export async function getOrCreateUraConfig() {
  const existing = await prisma.uraConfig.findFirst({ include: INCLUDE_FULL })
  if (existing) return existing

  return prisma.uraConfig.create({
    data: {
      greetingText:
        "Olá! 👋 Como podemos te ajudar?\n\n" +
        "1️⃣  Vendas\n" +
        "2️⃣  Financeiro\n\n" +
        "Responda com o número da opção desejada.",
      isActive:           true,
      outOfOfficeMessage: "Olá! 😊 No momento estamos fora do horário de atendimento.\nAcesse nosso site e aproveite nossas promoções! 🛍️",
      lunchMessage:       "Estamos em pausa para o almoço. 🍽️ Retornamos em breve! Enquanto isso, confira nossas ofertas no site.",
      options: {
        create: [
          { digit: "1", label: "Vendas",      targetDepartment: "VENDAS",      order: 0 },
          { digit: "2", label: "Financeiro",  targetDepartment: "FINANCEIRO",  order: 1 },
        ],
      },
      businessHours: { create: DEFAULT_BIZ_HOURS },
    },
    include: INCLUDE_FULL,
  })
}

export type UraConfigFull = NonNullable<Awaited<ReturnType<typeof getOrCreateUraConfig>>>

// ─── 30-second in-memory cache (avoids DB hit per webhook message) ────────────

let _cache: { data: UraConfigFull; ts: number } | null = null
const TTL = 30_000

export async function getUraConfigCached(): Promise<UraConfigFull> {
  if (_cache && Date.now() - _cache.ts < TTL) return _cache.data
  const data = await getOrCreateUraConfig()
  _cache = { data, ts: Date.now() }
  return data
}

export function invalidateUraCache(): void {
  _cache = null
}

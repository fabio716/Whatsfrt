import type { UraConfigFull } from "@/lib/ura"

export type BizStatus = "OPEN" | "CLOSED" | "LUNCH"

function toMin(time: string): number {
  const [h = "0", m = "0"] = time.split(":")
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

/**
 * Returns the current business status based on the URA config's businessHours,
 * forcing the America/Sao_Paulo timezone via Intl (no external deps).
 * Returns "OPEN" when no business hours are configured (always open).
 */
export function isBusinessHour(config: UraConfigFull): BizStatus {
  const bh = config.businessHours
  if (!bh?.length) return "OPEN"

  const now = new Date()

  // Day of week in São Paulo
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(now) // "Sun" | "Mon" | ... | "Sat"

  // Hour + minute in São Paulo
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour:     "2-digit",
    minute:   "2-digit",
    hour12:   false,
  }).formatToParts(now)

  const hourStr = timeParts.find((p) => p.type === "hour")?.value   ?? "0"
  const minStr  = timeParts.find((p) => p.type === "minute")?.value ?? "0"

  const DAY_MAP: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  const dayOfWeek = DAY_MAP[weekdayShort] ?? 1
  const nowMin    = parseInt(hourStr, 10) * 60 + parseInt(minStr, 10)

  const day = bh.find((b) => b.dayOfWeek === dayOfWeek)
  if (!day || day.isClosed) return "CLOSED"

  if (nowMin < toMin(day.openTime) || nowMin >= toMin(day.closeTime)) return "CLOSED"

  if (day.hasLunchBreak && nowMin >= toMin(day.lunchStart) && nowMin < toMin(day.lunchEnd)) {
    return "LUNCH"
  }

  return "OPEN"
}

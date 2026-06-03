import { toZonedTime, format } from "date-fns-tz"
import { parse, isWithinInterval } from "date-fns"
import { prisma } from "@/lib/prisma"
import type { BusinessHoursCheck } from "./types"

// ═══════════════════════════════════════════════════════════════════════════
// Validador de Expediente (Timezone: America/Sao_Paulo)
// ═══════════════════════════════════════════════════════════════════════════

const TIMEZONE = "America/Sao_Paulo"

export class BusinessHoursValidator {
  /**
   * Verifica se está dentro do expediente
   * SEMPRE usa timezone America/Sao_Paulo
   */
  static async check(): Promise<BusinessHoursCheck> {
    try {
      // Pega horário atual em São Paulo
      const now = toZonedTime(new Date(), TIMEZONE)
      const dayOfWeek = now.getDay() // 0=Dom, 1=Seg, ..., 6=Sáb

      // Busca configuração do dia
      const config = await prisma.uraConfig.findFirst({
        where: { isActive: true },
        include: {
          businessHours: {
            where: { dayOfWeek },
          },
        },
      })

      if (!config || config.businessHours.length === 0) {
        // Sem configuração = fora do expediente
        return {
          isOpen: false,
          isLunchTime: false,
        }
      }

      const hours = config.businessHours[0]

      // Se dia está fechado
      if (hours.isClosed) {
        return {
          isOpen: false,
          isLunchTime: false,
          nextOpenTime: this.getNextOpenTime(now),
        }
      }

      // Converte horários para Date objects (mesmo dia)
      const todayStr = format(now, "yyyy-MM-dd", { timeZone: TIMEZONE })
      const openTime = parse(`${todayStr} ${hours.openTime}`, "yyyy-MM-dd HH:mm", now)
      const closeTime = parse(`${todayStr} ${hours.closeTime}`, "yyyy-MM-dd HH:mm", now)

      // Verifica se está dentro do horário comercial
      const isWithinBusinessHours = isWithinInterval(now, {
        start: openTime,
        end: closeTime,
      })

      if (!isWithinBusinessHours) {
        return {
          isOpen: false,
          isLunchTime: false,
          nextOpenTime: this.getNextOpenTime(now),
        }
      }

      // Verifica horário de almoço
      if (hours.hasLunchBreak) {
        const lunchStart = parse(`${todayStr} ${hours.lunchStart}`, "yyyy-MM-dd HH:mm", now)
        const lunchEnd = parse(`${todayStr} ${hours.lunchEnd}`, "yyyy-MM-dd HH:mm", now)

        const isLunchTime = isWithinInterval(now, {
          start: lunchStart,
          end: lunchEnd,
        })

        if (isLunchTime) {
          return {
            isOpen: false,
            isLunchTime: true,
            nextOpenTime: lunchEnd,
          }
        }
      }

      // Está aberto!
      return {
        isOpen: true,
        isLunchTime: false,
      }
    } catch (err) {
      console.error("[BusinessHours] Error checking hours:", err)
      // Em caso de erro, assume fechado por segurança
      return {
        isOpen: false,
        isLunchTime: false,
      }
    }
  }

  /**
   * Calcula próximo horário de abertura
   */
  private static async getNextOpenTime(currentTime: Date): Promise<Date | undefined> {
    try {
      const config = await prisma.uraConfig.findFirst({
        where: { isActive: true },
        include: { businessHours: true },
      })

      if (!config) return undefined

      // Procura próximo dia útil (máx 7 dias)
      for (let i = 1; i <= 7; i++) {
        const nextDay = new Date(currentTime)
        nextDay.setDate(nextDay.getDate() + i)
        const nextDayOfWeek = nextDay.getDay()

        const hours = config.businessHours.find((h) => h.dayOfWeek === nextDayOfWeek)
        if (hours && !hours.isClosed) {
          const dateStr = format(nextDay, "yyyy-MM-dd", { timeZone: TIMEZONE })
          return parse(`${dateStr} ${hours.openTime}`, "yyyy-MM-dd HH:mm", nextDay)
        }
      }

      return undefined
    } catch (err) {
      console.error("[BusinessHours] Error getting next open time:", err)
      return undefined
    }
  }

  /**
   * Formata horário de retorno para mensagem
   */
  static formatNextOpenTime(date: Date | undefined): string {
    if (!date) return "em breve"

    const zonedDate = toZonedTime(date, TIMEZONE)
    const dayName = format(zonedDate, "EEEE", { timeZone: TIMEZONE })
    const time = format(zonedDate, "HH:mm", { timeZone: TIMEZONE })

    const dayNames: Record<string, string> = {
      Monday: "Segunda-feira",
      Tuesday: "Terça-feira",
      Wednesday: "Quarta-feira",
      Thursday: "Quinta-feira",
      Friday: "Sexta-feira",
      Saturday: "Sábado",
      Sunday: "Domingo",
    }

    return `${dayNames[dayName] || dayName} às ${time}`
  }

  /**
   * Retorna horário atual em São Paulo (para debug)
   */
  static getCurrentTime(): Date {
    return toZonedTime(new Date(), TIMEZONE)
  }
}

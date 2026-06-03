import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// GET - Busca configuração da URA
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    let config = await prisma.uraConfig.findFirst({
      where: { isActive: true },
      include: {
        businessHours: { orderBy: { dayOfWeek: "asc" } },
        nightOffer: true,
      },
    })

    // Se não existe, cria configuração padrão
    if (!config) {
      config = await prisma.uraConfig.create({
        data: {
          isActive: true,
          businessHours: {
            create: [
              { dayOfWeek: 0, isClosed: true }, // Domingo
              { dayOfWeek: 1, openTime: "08:00", closeTime: "18:00", hasLunchBreak: true, lunchStart: "12:00", lunchEnd: "13:00" },
              { dayOfWeek: 2, openTime: "08:00", closeTime: "18:00", hasLunchBreak: true, lunchStart: "12:00", lunchEnd: "13:00" },
              { dayOfWeek: 3, openTime: "08:00", closeTime: "18:00", hasLunchBreak: true, lunchStart: "12:00", lunchEnd: "13:00" },
              { dayOfWeek: 4, openTime: "08:00", closeTime: "18:00", hasLunchBreak: true, lunchStart: "12:00", lunchEnd: "13:00" },
              { dayOfWeek: 5, openTime: "08:00", closeTime: "18:00", hasLunchBreak: true, lunchStart: "12:00", lunchEnd: "13:00" },
              { dayOfWeek: 6, isClosed: true }, // Sábado
            ],
          },
        },
        include: {
          businessHours: { orderBy: { dayOfWeek: "asc" } },
          nightOffer: true,
        },
      })
    }

    return NextResponse.json(config)
  } catch (err) {
    console.error("[URA Config] Error:", err)
    return NextResponse.json({ error: "Erro ao buscar configuração" }, { status: 500 })
  }
}

// PUT - Atualiza configuração
export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  try {
    const body = await request.json()
    const { messages, businessHours, nightOffer } = body

    const config = await prisma.uraConfig.findFirst({ where: { isActive: true } })
    if (!config) {
      return NextResponse.json({ error: "Configuração não encontrada" }, { status: 404 })
    }

    // Atualiza mensagens
    if (messages) {
      await prisma.uraConfig.update({
        where: { id: config.id },
        data: {
          greetingText: messages.greetingText,
          outOfOfficeMessage: messages.outOfOfficeMessage,
          lunchMessage: messages.lunchMessage,
          askNameMessage: messages.askNameMessage,
          askProfileMessage: messages.askProfileMessage,
          askSectorMessage: messages.askSectorMessage,
          nightAskNameMessage: messages.nightAskNameMessage,
          nightAskSectorMessage: messages.nightAskSectorMessage,
          nightAskSubjectMessage: messages.nightAskSubjectMessage,
        },
      })
    }

    // Atualiza horários
    if (businessHours && Array.isArray(businessHours)) {
      for (const hour of businessHours) {
        await prisma.businessHour.upsert({
          where: {
            configId_dayOfWeek: {
              configId: config.id,
              dayOfWeek: hour.dayOfWeek,
            },
          },
          create: {
            configId: config.id,
            dayOfWeek: hour.dayOfWeek,
            isClosed: hour.isClosed,
            openTime: hour.openTime,
            closeTime: hour.closeTime,
            hasLunchBreak: hour.hasLunchBreak,
            lunchStart: hour.lunchStart,
            lunchEnd: hour.lunchEnd,
          },
          update: {
            isClosed: hour.isClosed,
            openTime: hour.openTime,
            closeTime: hour.closeTime,
            hasLunchBreak: hour.hasLunchBreak,
            lunchStart: hour.lunchStart,
            lunchEnd: hour.lunchEnd,
          },
        })
      }
    }

    // Atualiza oferta noturna
    if (nightOffer) {
      await prisma.nightOffer.upsert({
        where: { configId: config.id },
        create: {
          configId: config.id,
          isActive: nightOffer.isActive,
          couponCode: nightOffer.couponCode,
          discountType: nightOffer.discountType,
          discountValue: nightOffer.discountValue,
          storeUrl: nightOffer.storeUrl,
          offerMessage: nightOffer.offerMessage,
        },
        update: {
          isActive: nightOffer.isActive,
          couponCode: nightOffer.couponCode,
          discountType: nightOffer.discountType,
          discountValue: nightOffer.discountValue,
          storeUrl: nightOffer.storeUrl,
          offerMessage: nightOffer.offerMessage,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[URA Config] Error updating:", err)
    return NextResponse.json({ error: "Erro ao atualizar configuração" }, { status: 500 })
  }
}

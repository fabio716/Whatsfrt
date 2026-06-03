import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// Busca fotos de perfil da Evolution API para contatos sem foto
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instance = process.env.EVOLUTION_INSTANCE_NAME

  if (!apiUrl || !apiKey || !instance) {
    return NextResponse.json({ error: "Evolution API não configurada" }, { status: 500 })
  }

  try {
    // Busca contatos sem foto
    const contacts = await prisma.contact.findMany({
      where: {
        profilePhotoUrl: null,
        deletedAt: null,
      },
      select: {
        id: true,
        whatsappId: true,
      },
    })

    let updated = 0
    let failed = 0

    for (const contact of contacts) {
      try {
        // Busca foto do contato na Evolution API
        const number = contact.whatsappId.replace("@s.whatsapp.net", "")
        const res = await fetch(`${apiUrl}/chat/fetchProfilePictureUrl/${instance}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey,
          },
          body: JSON.stringify({ number }),
        })

        if (res.ok) {
          const data = await res.json()
          if (data.profilePictureUrl) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { profilePhotoUrl: data.profilePictureUrl },
            })
            updated++
          }
        }
      } catch (err) {
        console.error(`Failed to fetch photo for ${contact.whatsappId}:`, err)
        failed++
      }

      // Delay para não sobrecarregar API
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      success: true,
      total: contacts.length,
      updated,
      failed,
    })
  } catch (err) {
    console.error("Error syncing photos:", err)
    return NextResponse.json({ error: "Erro ao sincronizar fotos" }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"
import { getProfilePicture } from "@/lib/whatsapp"

// POST /api/admin/contacts/sync-photos
// Busca a foto de perfil (pelo provedor ativo — Z-API ou Evolution) dos contatos
// que ainda não têm foto e salva em profilePhotoUrl. Processa em LOTE (até 150
// por chamada) pra não travar; devolve quantos ainda faltam pra rodar de novo.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const BATCH = 150

  const contacts = await prisma.contact.findMany({
    where: { profilePhotoUrl: null, deletedAt: null },
    select: { id: true, whatsappId: true },
    take: BATCH,
  })

  let updated = 0
  let semFoto = 0
  for (const c of contacts) {
    try {
      const url = await getProfilePicture(c.whatsappId)
      if (url) {
        await prisma.contact.update({ where: { id: c.id }, data: { profilePhotoUrl: url } })
        updated++
      } else {
        semFoto++
      }
    } catch {
      semFoto++
    }
    // Pequeno respiro pra não estourar rate-limit do provedor.
    await new Promise((r) => setTimeout(r, 250))
  }

  const restantes = await prisma.contact.count({
    where: { profilePhotoUrl: null, deletedAt: null },
  })

  return NextResponse.json({
    success: true,
    processados: contacts.length,
    updated,
    semFoto,
    restantes,
  })
}

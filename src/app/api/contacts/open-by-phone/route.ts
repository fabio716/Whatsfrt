import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { findOrCreateContact } from "@/lib/contactLookup"

export const dynamic = "force-dynamic"

// POST /api/contacts/open-by-phone { phone, name? }
// Usado pelo cartão de contato compartilhado no chat: acha (ou cria) o
// contato daquele número e devolve o id pra abrir a conversa.
// Regras de carteira:
//   - contato sem dono → vira do agente que clicou (senão ele nem conseguiria
//     abrir o chat, que é privado por carteira)
//   - contato de OUTRO agente → 409 com o nome do dono (pede transferência)
//   - admin abre qualquer um
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let body: { phone?: string; name?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const digits = (body.phone ?? "").replace(/\D/g, "")
  if (digits.length < 8 || digits.length > 15) {
    return NextResponse.json({ error: "Número inválido" }, { status: 400 })
  }

  const whatsappId = `${digits}@s.whatsapp.net`
  // Passa o nome só como fallback de CRIAÇÃO — não sobrescreve o nome de um
  // contato que já existe no sistema.
  const contact = await findOrCreateContact(whatsappId, { fallbackName: body.name?.trim() || digits })

  if (auth.role === "AGENT") {
    if (contact.assignedUserId && contact.assignedUserId !== auth.id) {
      const owner = await prisma.user.findUnique({
        where: { id: contact.assignedUserId },
        select: { name: true },
      })
      return NextResponse.json({
        error: `Este contato já é atendido por ${owner?.name ?? "outro agente"}. Peça a transferência para falar com ele.`,
      }, { status: 409 })
    }
    if (!contact.assignedUserId) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { assignedUserId: auth.id },
      })
    }
  }

  return NextResponse.json({ id: contact.id })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

// Tela de Contatos (admin) — aberta também pro AGENT (só leitura + sincronizar
// fotos + importar). Exportar CSV e liberar contato continuam admin-only.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const contacts = await prisma.contact.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      whatsappId: true,
      empresa: true,
      cidade: true,
      chatStatus: true,
      createdAt: true,
      assignedUser: { select: { id: true, name: true } },
      cooperative: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json(contacts)
}

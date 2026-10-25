import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/app/api/admin/users/route"

// O nome do contato vem do WhatsApp do cliente. Célula começando com = + - @
// vira FÓRMULA quando abre no Excel (pode até mandar dados pra fora). O
// apóstrofo na frente faz o Excel tratar como texto.
function semFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId")

  const contacts = await prisma.contact.findMany({
    where: {
      deletedAt: null,
      ...(userId ? { assignedUserId: userId } : {}),
    },
    include: { assignedUser: { select: { name: true } } },
    orderBy: { name: "asc" },
  })

  // Build CSV
  const header = "nome,telefone,status,agente,criado_em"
  const rows = contacts.map((c) => {
    const phone = c.whatsappId.replace("@s.whatsapp.net", "").replace("@g.us", "")
    const agent = c.assignedUser?.name ?? ""
    const date  = c.createdAt.toLocaleDateString("pt-BR")
    const cols  = [c.name, phone, c.chatStatus, agent, date].map((v) =>
      `"${semFormula(String(v)).replace(/"/g, '""')}"`)
    return cols.join(",")
  })

  const csv = [header, ...rows].join("\r\n")

  const agentLabel = userId
    ? (contacts[0]?.assignedUser?.name ?? userId).replace(/[^a-z0-9]/gi, "_")
    : "todos"
  const filename = `contatos_${agentLabel}_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}

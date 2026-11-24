import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { filtrarFilaDoSetor } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// "Estou ciente" do alerta do gerente virtual. Grava quem e quando. Só vale
// para ocorrência da própria pessoa ou da fila (sem dono).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const corpo = (await request.json().catch(() => null)) as { ids?: unknown } | null
  const ids = Array.isArray(corpo?.ids) ? corpo.ids.filter((x): x is string => typeof x === "string").slice(0, 50) : []
  if (ids.length === 0) return NextResponse.json({ erro: "Nada para confirmar." }, { status: 400 })
  // Ciência da fila só vale para quem é do setor do cliente (outro setor não "apaga" o aviso).
  const daFila = await prisma.gerenteOcorrencia.findMany({ where: { id: { in: ids }, userId: null }, select: { id: true, contactId: true } })
  const permitidasFila = new Set((await filtrarFilaDoSetor(auth.id, daFila)).map((o) => o.id))
  const liberados = ids.filter((id) => !daFila.some((o) => o.id === id) || permitidasFila.has(id))
  const r = await prisma.gerenteOcorrencia.updateMany({
    where: { id: { in: liberados }, cienteAt: null, OR: [{ userId: auth.id }, { userId: null }] },
    data: { cienteAt: new Date(), cienteUserId: auth.id },
  })
  return NextResponse.json({ ok: true, confirmadas: r.count })
}

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { avisarRespostaDeAviso } from "@/lib/gerenteVirtual"

export const dynamic = "force-dynamic"

// "Ciente" do aviso: grava quem e quando. Só vale para quem foi escolhido.
// Se o aviso é uma PERGUNTA, a resposta escrita é obrigatória; nos demais, é um comentário opcional.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await ctx.params
  const c = (await request.json().catch(() => null)) as { resposta?: unknown } | null
  const resposta = typeof c?.resposta === "string" ? c.resposta.trim().slice(0, 500) : ""
  const d = await prisma.avisoDestinatario.findUnique({
    where: { avisoId_userId: { avisoId: id, userId: auth.id } },
    select: { cienteAt: true, aviso: { select: { titulo: true, criadoPorId: true, exigeResposta: true } } },
  })
  if (!d) return NextResponse.json({ erro: "Aviso não encontrado." }, { status: 404 })
  if (d.cienteAt) return NextResponse.json({ ok: true }) // já registrado: não muda a data nem a resposta
  if (d.aviso.exigeResposta && resposta.length < 2) {
    return NextResponse.json({ erro: "Este aviso é uma pergunta: escreva a sua resposta para dar o ciente." }, { status: 400 })
  }
  const m = await prisma.avisoDestinatario.updateMany({
    where: { avisoId: id, userId: auth.id, cienteAt: null },
    data: { cienteAt: new Date(), resposta: resposta || null },
  })
  if (m.count > 0 && resposta) await avisarRespostaDeAviso(id, d.aviso.criadoPorId, auth.name, d.aviso.titulo, resposta)
  return NextResponse.json({ ok: true })
}

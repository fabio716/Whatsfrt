import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { sendPushToUsers } from "@/lib/push"
import { checkRateLimit } from "@/lib/rateLimit"

export const dynamic = "force-dynamic"

// A pessoa discorda de um registro do gerente virtual (cliente esperando, retorno
// atrasado ou retorno "não aceito") e explica. Vai para o administrador decidir —
// nenhuma decisão automática contra a pessoa fica sem revisão humana.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const corpo = (await request.json().catch(() => null)) as { tipo?: unknown; id?: unknown; texto?: unknown } | null
  const tipo = corpo?.tipo
  const id = typeof corpo?.id === "string" ? corpo.id : ""
  const texto = typeof corpo?.texto === "string" ? corpo.texto.trim().slice(0, 500) : ""
  if ((tipo !== "OCORRENCIA" && tipo !== "RETORNO") || !id) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 })
  if (texto.length < 10) return NextResponse.json({ erro: "Explique o que aconteceu (pelo menos 10 letras)." }, { status: 400 })
  const limite = await checkRateLimit(`rl:gerente-contestar:${auth.id}`, 20, 3600)
  if (!limite.allowed) return NextResponse.json({ erro: "Muitas contestações em pouco tempo." }, { status: 429 })

  let cliente = "cliente"
  if (tipo === "OCORRENCIA") {
    const o = await prisma.gerenteOcorrencia.findUnique({ where: { id }, select: { userId: true, contactId: true } })
    if (!o || (o.userId !== auth.id && o.userId !== null)) return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 })
    cliente = (await prisma.contact.findUnique({ where: { id: o.contactId }, select: { name: true } }))?.name ?? cliente
    // Contestar também registra a ciência (a pessoa viu e respondeu).
    await prisma.gerenteOcorrencia.update({
      where: { id },
      data: { contestadaEm: new Date(), contestacao: texto, ...(await prisma.gerenteOcorrencia.findUnique({ where: { id }, select: { cienteAt: true } }))?.cienteAt ? {} : { cienteAt: new Date(), cienteUserId: auth.id } },
    })
  } else {
    const r = await prisma.contactReminder.findUnique({ where: { id }, select: { userId: true, contact: { select: { name: true } } } })
    if (!r || r.userId !== auth.id) return NextResponse.json({ erro: "Retorno não encontrado." }, { status: 404 })
    cliente = r.contact.name
    await prisma.contactReminder.update({ where: { id }, data: { contestadaEm: new Date(), contestacao: texto } })
  }

  const admins = (await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } })).map((a) => a.id)
  sendPushToUsers(admins, {
    title: `💬 ${auth.name.split(/\s+/)[0]} contestou um registro`, body: `${cliente}: ${texto.slice(0, 120)}`,
    tag: `contestacao-${id}`, url: "/admin/gerente",
  }).catch((e: unknown) => console.error("[gerente] push contestação falhou:", e instanceof Error ? e.message : e))
  return NextResponse.json({ ok: true })
}

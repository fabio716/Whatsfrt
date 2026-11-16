import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { primeiraRespostaHumana } from "@/lib/retornoAtendido"
import { sendPushToUsers } from "@/lib/push"

export const dynamic = "force-dynamic"

const REABRIR_EM_MS = 30 * 60_000

// Fila de conferência: retornos que a pessoa marcou como feitos (com canal e
// relato) e que aguardam o administrador fechar como Concluído ou Não concluído.
// Para WhatsApp/frtwhats o sistema procura a mensagem dela no chat como evidência.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const [pendentes, recentes] = await Promise.all([
    prisma.contactReminder.findMany({
      where: { conferencia: "PENDENTE", doneAt: { not: null } },
      orderBy: { doneAt: "asc" }, take: 100,
      select: { id: true, dueAt: true, doneAt: true, canal: true, relato: true, note: true,
        user: { select: { name: true } }, contact: { select: { id: true, name: true } } },
    }),
    prisma.contactReminder.findMany({
      where: { conferencia: { in: ["CONCLUIDO", "NAO_CONCLUIDO"] }, conferidaEm: { gte: new Date(Date.now() - 7 * 86_400_000) } },
      orderBy: { conferidaEm: "desc" }, take: 30,
      select: { id: true, conferencia: true, conferidaEm: true, conferenciaNota: true, canal: true,
        user: { select: { name: true } }, contact: { select: { name: true } } },
    }),
  ])
  const respostas = await primeiraRespostaHumana(pendentes.map((p) => p.id))
  return NextResponse.json({
    pendentes: pendentes.map((p) => {
      const dono = respostas.get(p.id)?.dono ?? null
      const noSistema = p.canal === "WHATSAPP" || p.canal === "FRTWHATS"
      return {
        id: p.id, contactId: p.contact.id, cliente: p.contact.name, atendente: p.user.name,
        dueAt: p.dueAt.toISOString(), feitoEm: p.doneAt?.toISOString() ?? null,
        atrasoMin: p.doneAt ? Math.round((p.doneAt.getTime() - p.dueAt.getTime()) / 60_000) : 0,
        canal: p.canal, relato: p.relato, nota: p.note,
        // Só dá para conferir sozinho o que passou pelo chat do sistema.
        evidencia: dono ? { achou: true, em: dono.em.toISOString(), texto: dono.texto }
          : { achou: false, motivo: noSistema ? "Não achei mensagem dela para este cliente no chat." : "Canal fora do sistema: confira com a pessoa ou com o cliente." },
      }
    }),
    recentes: recentes.map((r) => ({
      id: r.id, decisao: r.conferencia, em: r.conferidaEm?.toISOString() ?? null, motivo: r.conferenciaNota,
      canal: r.canal, atendente: r.user.name, cliente: r.contact.name,
    })),
  })
}

// Decide: CONCLUIDO fecha. NAO_CONCLUIDO reabre o retorno para a pessoa refazer
// (novo prazo de 30 min) e avisa com o motivo.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const corpo = (await request.json().catch(() => null)) as { id?: unknown; decisao?: unknown; nota?: unknown } | null
  const id = typeof corpo?.id === "string" ? corpo.id : ""
  const decisao = corpo?.decisao
  const nota = typeof corpo?.nota === "string" ? corpo.nota.trim().slice(0, 300) : ""
  if (!id || (decisao !== "CONCLUIDO" && decisao !== "NAO_CONCLUIDO")) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 })
  if (decisao === "NAO_CONCLUIDO" && nota.length < 5) return NextResponse.json({ erro: "Explique o que faltou (para a pessoa saber o que refazer)." }, { status: 400 })

  const r = await prisma.contactReminder.findUnique({
    where: { id }, select: { userId: true, conferencia: true, contact: { select: { id: true, name: true } } },
  })
  if (!r || r.conferencia !== "PENDENTE") return NextResponse.json({ erro: "Este retorno já foi conferido." }, { status: 409 })

  const base = { conferidaEm: new Date(), conferidaPorId: auth.id, conferenciaNota: nota || null }
  if (decisao === "CONCLUIDO") {
    await prisma.contactReminder.updateMany({ where: { id, conferencia: "PENDENTE" }, data: { ...base, conferencia: "CONCLUIDO" } })
  } else {
    const novoPrazo = new Date(Date.now() + REABRIR_EM_MS)
    await prisma.contactReminder.updateMany({
      where: { id, conferencia: "PENDENTE" },
      data: { ...base, conferencia: "NAO_CONCLUIDO", doneAt: null, dueAt: novoPrazo, notifiedAt: null, escalonadoAt: null, cienteAt: null },
    })
    sendPushToUsers([r.userId], {
      title: `❌ Retorno não aceito: ${r.contact.name}`,
      body: `A gerência não deu como concluído: ${nota}. Refaça até ${novoPrazo.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}.`,
      tag: `reaberto-${id}`, url: `/admin/chats?contact=${r.contact.id}`,
    }).catch((e: unknown) => console.error("[gerente] push reabertura falhou:", e instanceof Error ? e.message : e))
  }
  return NextResponse.json({ ok: true })
}

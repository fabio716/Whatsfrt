import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { normalizarLetras, normalizarTermo } from "@/app/admin/components/buscaTexto"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── GET /api/internal/conversations/[id]/search?q=<termo> ────────────────────
// Lupa do chat interno. A tela só tem as últimas 50 mensagens carregadas, então
// a busca roda aqui, na conversa inteira. Devolve só id + data dos achados (do
// mais recente pro mais antigo); a tela carrega o trecho quando precisa.
//
// Sem acento e sem maiúscula ("orcamento" acha "Orçamento"), com a MESMA
// regra que a tela usa pra marcar o texto. Por isso compara aqui em JS, e não
// no banco (o Postgres precisaria da extensão unaccent).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth
  const { id } = await params

  const eu = await prisma.internalConversationMember.findFirst({
    where: { conversationId: id, userId: auth.id },
    select: { clearedAt: true },
  })
  if (!eu) return NextResponse.json({ error: "Sem acesso a esta conversa" }, { status: 403 })

  const termo = normalizarTermo(request.nextUrl.searchParams.get("q") ?? "")
  if (!termo) return NextResponse.json({ achados: [] })

  // Respeita "apagar conversa": o que eu apaguei não aparece na busca.
  const linhas = await prisma.internalMessage.findMany({
    where: {
      conversationId: id,
      body: { not: "" },
      ...(eu.clearedAt ? { createdAt: { gt: eu.clearedAt } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, createdAt: true },
  })

  const achados = linhas
    .filter((m) => normalizarLetras(m.body).norm.includes(termo))
    .slice(0, 500)
    .map((m) => ({ id: m.id, createdAt: m.createdAt }))

  return NextResponse.json({ achados })
}

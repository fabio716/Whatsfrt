import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// ─── Ordem dos cartões do painel ──────────────────────────────────────────────
// GET  → a ordem salva desta pessoa ([] = nunca mexeu, usa o padrão do papel).
// PUT  → grava a ordem nova depois de arrastar.
//
// Fica no banco (e não no navegador) porque a equipe trabalha no computador e
// no celular: arrumou num, já está arrumado no outro.

const MAX_IDS = 40
const ID_VALIDO = /^[a-z0-9-]{1,40}$/

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const user = await prisma.user.findUnique({
    where: { id: auth.id },
    select: { dashboardLayout: true },
  })

  return NextResponse.json({ ordem: parseOrdem(user?.dashboardLayout) })
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  let body: { ordem?: unknown }
  try {
    body = (await request.json()) as { ordem?: unknown }
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  if (!Array.isArray(body.ordem)) {
    return NextResponse.json({ error: "Envie { ordem: string[] }" }, { status: 400 })
  }
  if (body.ordem.length > MAX_IDS) {
    return NextResponse.json({ error: "Ordem longa demais" }, { status: 400 })
  }

  // Só ids de cartão — a coluna é texto e vai voltar pra tela depois.
  const ordem: string[] = []
  for (const item of body.ordem) {
    if (typeof item !== "string" || !ID_VALIDO.test(item)) {
      return NextResponse.json({ error: "Id de cartão inválido" }, { status: 400 })
    }
    if (!ordem.includes(item)) ordem.push(item)
  }

  await prisma.user.update({
    where: { id: auth.id },
    data: { dashboardLayout: JSON.stringify(ordem) },
  })

  return NextResponse.json({ ok: true, ordem })
}

// Leitura tolerante: conteúdo estragado nunca quebra o painel, só cai no
// padrão. Um cartão que deixou de existir é descartado na tela.
function parseOrdem(bruto: string | undefined): string[] {
  if (!bruto) return []
  try {
    const dados: unknown = JSON.parse(bruto)
    if (!Array.isArray(dados)) return []
    return dados.filter((x): x is string => typeof x === "string" && ID_VALIDO.test(x)).slice(0, MAX_IDS)
  } catch {
    return []
  }
}

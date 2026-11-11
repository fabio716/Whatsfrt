import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { aiConfigured } from "@/lib/ai"
import { getAtendenteConfig } from "@/lib/atendenteVirtual"
import { sincronizarPrecosSite } from "@/lib/precosSite"
import { checkRateLimit } from "@/lib/rateLimit"

export const dynamic = "force-dynamic"

// Atendente virtual — liga/desliga, modo teste e preços do site. Só admin.
async function estado() {
  const [cfg, site, base] = await Promise.all([
    getAtendenteConfig(),
    prisma.aiKnowledge.findUnique({ where: { id: "site" }, select: { content: true, updatedAt: true } }),
    prisma.aiKnowledge.findUnique({ where: { id: "main" }, select: { content: true } }),
  ])
  return {
    ativoNoite: cfg.ativoNoite,
    ativoAlmoco: cfg.ativoAlmoco,
    numerosTeste: cfg.numerosTeste,
    configured: aiConfigured(),
    baseVazia: !base?.content.trim(),
    precosAtualizadosEm: site?.updatedAt ?? null,
    precosQtd: site ? (site.content.match(/^- /gm) ?? []).length : 0,
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  return NextResponse.json(await estado())
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  let body: { ativoNoite?: unknown; ativoAlmoco?: unknown; numerosTeste?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }
  const numeros = String(body.numerosTeste ?? "").replace(/[^\d,;\s()+-]/g, "").slice(0, 500)
  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: { name: true } })
  await getAtendenteConfig()
  await prisma.atendenteVirtualConfig.update({
    where: { id: "main" },
    data: {
      ativoNoite: body.ativoNoite === true,
      ativoAlmoco: body.ativoAlmoco === true,
      numerosTeste: numeros.trim(),
      updatedBy: user?.name ?? null,
    },
  })
  return NextResponse.json(await estado())
}

// POST = atualizar agora a lista de preços lida do site.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const limite = await checkRateLimit(`av:sync:${auth.id}`, 3, 600)
  if (!limite.allowed) {
    return NextResponse.json({ error: "Aguarde alguns minutos antes de atualizar de novo." }, { status: 429 })
  }
  const r = await sincronizarPrecosSite()
  if (!r.ok) return NextResponse.json({ error: r.erro ?? "Não foi possível ler o site." }, { status: 502 })
  return NextResponse.json(await estado())
}

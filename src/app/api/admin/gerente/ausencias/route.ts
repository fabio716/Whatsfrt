import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"

export const dynamic = "force-dynamic"

// Ausências da equipe (botão "Ausente"): quantas vezes, tempo total e médio, e a lista
// recente — com o motivo, se a pessoa quis escrever. Só administrador. Para orientação.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  const dias = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("dias")) || 7))
  const lista = await prisma.ausencia.findMany({
    where: { inicio: { gte: new Date(Date.now() - dias * 86_400_000) } }, orderBy: { inicio: "desc" }, take: 500,
  })
  const usuarios = await prisma.user.findMany({ where: { id: { in: [...new Set(lista.map((a) => a.userId))] } }, select: { id: true, name: true } })
  const nome = new Map(usuarios.map((u) => [u.id, u.name]))

  const por = new Map<string, { nome: string; vezes: number; total: number; maior: number; semVoltei: number; emAndamento: number }>()
  for (const a of lista) {
    const p = por.get(a.userId) ?? { nome: nome.get(a.userId) ?? "—", vezes: 0, total: 0, maior: 0, semVoltei: 0, emAndamento: 0 }
    p.vezes++
    if (a.fim === null) p.emAndamento++
    else { p.total += a.duracaoMin ?? 0; p.maior = Math.max(p.maior, a.duracaoMin ?? 0) }
    if (a.autoEncerrada) p.semVoltei++
    por.set(a.userId, p)
  }
  return NextResponse.json({
    dias,
    // Ordem alfabética: relatório para orientação, não para expor ninguém.
    resumo: [...por.values()]
      .map((p) => ({ ...p, mediaMin: p.vezes - p.emAndamento > 0 ? Math.round(p.total / (p.vezes - p.emAndamento)) : 0 }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    recentes: lista.slice(0, 60).map((a) => ({
      id: a.id, pessoa: nome.get(a.userId) ?? "—", inicio: a.inicio.toISOString(), duracaoMin: a.duracaoMin,
      emAndamento: a.fim === null, semVoltei: a.autoEncerrada, motivo: a.motivo,
    })),
  })
}

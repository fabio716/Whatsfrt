import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getSessionFromRequest } from "@/lib/auth"
import { processCampaign } from "@/lib/campaignQueue"

// PATCH /api/broadcast/[id] — pausar, retomar ou cancelar uma transmissão em
// andamento. Agente só mexe nas próprias transmissões; admin em qualquer uma.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const { id } = await params

  let body: { action?: "pause" | "resume" | "cancel" }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { status: true, createdById: true } })
  if (!campaign) return NextResponse.json({ error: "Transmissão não encontrada" }, { status: 404 })
  if (session.role === "AGENT" && campaign.createdById !== session.id) {
    return NextResponse.json({ error: "Sem permissão para esta transmissão" }, { status: 403 })
  }

  if (body.action === "pause") {
    if (campaign.status !== "PROCESSING" && campaign.status !== "PENDING") {
      return NextResponse.json({ error: "Só é possível pausar uma transmissão em andamento" }, { status: 400 })
    }
    await prisma.campaign.update({ where: { id }, data: { status: "PAUSED", pausedAt: new Date() } })
    return NextResponse.json({ status: "PAUSED" })
  }

  if (body.action === "resume") {
    if (campaign.status !== "PAUSED") {
      return NextResponse.json({ error: "Só é possível retomar uma transmissão pausada" }, { status: 400 })
    }
    await prisma.campaign.update({ where: { id }, data: { status: "PENDING", pausedAt: null } })
    processCampaign(id).catch((e: unknown) => console.error("[broadcast resume]", e))
    return NextResponse.json({ status: "PENDING" })
  }

  if (body.action === "cancel") {
    if (campaign.status === "COMPLETED" || campaign.status === "CANCELLED") {
      return NextResponse.json({ error: "Essa transmissão já não está em andamento" }, { status: 400 })
    }
    await prisma.campaign.update({ where: { id }, data: { status: "CANCELLED", pausedAt: null } })
    return NextResponse.json({ status: "CANCELLED" })
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 })
}

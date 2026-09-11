import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { sendStatus } from "@/lib/whatsapp"

export const dynamic = "force-dynamic"

// ─── Status (story do WhatsApp) ───────────────────────────────────────────────
// GET  → histórico dos últimos publicados.
// POST → publica um status novo (texto, imagem ou vídeo) no número da empresa.
// SÓ ADMIN (decisão do Fabio em 11/09/2026, revisada no mesmo dia): o status
// é do NÚMERO DA EMPRESA — todo cliente com o número salvo vê. Liberar pra
// todo mundo gerou confusão (agentes achando que era story individual).

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  const posts = await prisma.statusPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return NextResponse.json(posts)
}

interface PostBody {
  kind: "TEXT" | "IMAGE" | "VIDEO"
  text?: string
  mediaUrl?: string   // vindo do /api/broadcast/upload (/api/media/<arquivo>)
  mediaType?: string
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth

  let body: PostBody
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 })
  }

  const kind = body.kind
  const text = body.text?.trim() ?? ""

  if (kind === "TEXT" && !text) {
    return NextResponse.json({ error: "Escreva o texto do status" }, { status: 400 })
  }
  if ((kind === "IMAGE" || kind === "VIDEO") && !body.mediaUrl) {
    return NextResponse.json({ error: "Envie a imagem ou o vídeo" }, { status: 400 })
  }

  const filename = body.mediaUrl?.replace(/^\/api\/media\//, "")

  const result = await sendStatus({
    kind: kind === "TEXT" ? "text" : kind === "IMAGE" ? "image" : "video",
    text: text || undefined,
    filename,
    mimetype: body.mediaType,
  })

  const user = await prisma.user.findUnique({ where: { id: auth.id }, select: { name: true } })

  const post = await prisma.statusPost.create({
    data: {
      kind,
      text,
      mediaUrl: body.mediaUrl ?? null,
      mediaType: body.mediaType ?? null,
      createdById: auth.id,
      createdByName: user?.name ?? null,
      ok: result.ok,
      errorMsg: result.ok ? null : result.errorMsg,
    },
  })

  if (!result.ok) {
    return NextResponse.json({ error: `Falha ao publicar: ${result.errorMsg}`, post }, { status: 502 })
  }
  return NextResponse.json(post, { status: 201 })
}

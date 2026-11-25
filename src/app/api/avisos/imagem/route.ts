import { NextRequest, NextResponse } from "next/server"
import { requireAdmin, isErrorResponse } from "@/lib/auth"
import { saveMediaBuffer } from "@/lib/mediaStorage"

export const dynamic = "force-dynamic"

const MAX_BYTES = 5 * 1024 * 1024

// Confere pelos primeiros bytes que o arquivo é mesmo uma imagem (não confia só no tipo declarado).
function tipoReal(b: Buffer): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif"
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp"
  return null
}

// POST /api/avisos/imagem — o administrador envia (ou cola) uma imagem para anexar a um aviso.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin(request)
  if (isErrorResponse(auth)) return auth
  let form: FormData
  try { form = await request.formData() } catch { return NextResponse.json({ erro: "Não consegui ler o envio. Tente de novo." }, { status: 400 }) }
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ erro: "Escolha uma imagem." }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ erro: "A imagem é grande demais (máximo 5 MB)." }, { status: 413 })
  const dados = Buffer.from(await file.arrayBuffer())
  const tipo = tipoReal(dados)
  if (!tipo) return NextResponse.json({ erro: "Envie uma imagem PNG, JPG, GIF ou WEBP." }, { status: 415 })
  const ext = tipo === "image/jpeg" ? "jpg" : tipo.split("/")[1]
  const salvo = await saveMediaBuffer(dados, tipo, `aviso.${ext}`)
  return NextResponse.json({ mediaUrl: salvo.mediaUrl }, { status: 201 })
}

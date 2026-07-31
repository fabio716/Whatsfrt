import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { getProfilePicture } from "@/lib/whatsapp"

// POST /api/admin/contacts/sync-photos
// Busca a foto de perfil (pelo provedor ativo — Z-API ou Evolution) dos contatos
// que ainda não têm foto e salva em profilePhotoUrl. Processa em LOTE (até 150
// por chamada) pra não travar; devolve quantos ainda faltam pra rodar de novo.
//
// Paginação por cursor (id): a maioria dos contatos não tem foto pública no
// WhatsApp (semFoto), então sem cursor o lote de "profilePhotoUrl: null" nunca
// muda entre chamadas — a rotina ficava reprocessando os MESMOS ~150 contatos
// pra sempre e nunca avançava pro resto da base (6000+ contatos nunca eram
// sequer tentados). Com cursor, cada chamada sempre avança na lista.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  // Lote pequeno de propósito: o site roda atrás de Cloudflare, que corta a
  // conexão em ~100s. Um lote de 150 contatos (cada um com uma chamada à
  // Z-API + 250ms de respiro) passava desse tempo e o Cloudflare devolvia
  // 504 pro navegador, mesmo o processamento continuando no servidor por
  // baixo dos panos — o front nunca via o resultado real.
  const BATCH = 25

  let body: { cursorId?: string } = {}
  try {
    body = (await request.json()) as { cursorId?: string }
  } catch {
    // corpo vazio é válido (primeira chamada, sem cursor)
  }

  const contacts = await prisma.contact.findMany({
    where: {
      profilePhotoUrl: null,
      deletedAt: null,
      ...(body.cursorId ? { id: { gt: body.cursorId } } : {}),
    },
    select: { id: true, whatsappId: true },
    orderBy: { id: "asc" },
    take: BATCH,
  })

  let updated = 0
  let semFoto = 0
  let erroExemplo: string | null = null
  for (const c of contacts) {
    try {
      const url = await getProfilePicture(c.whatsappId)
      if (url) {
        await prisma.contact.update({ where: { id: c.id }, data: { profilePhotoUrl: url } })
        updated++
      } else {
        semFoto++
      }
    } catch (err) {
      semFoto++
      if (!erroExemplo) erroExemplo = err instanceof Error ? err.message : String(err)
    }
    // Pequeno respiro pra não estourar rate-limit do provedor.
    await new Promise((r) => setTimeout(r, 250))
  }

  const restantes = await prisma.contact.count({
    where: { profilePhotoUrl: null, deletedAt: null },
  })

  const nextCursor = contacts.length > 0 ? contacts[contacts.length - 1].id : null
  // fimDaLista: chegamos ao final da tabela nessa varredura (lote veio menor
  // que o BATCH). O front usa isso pra parar em vez de reiniciar do zero e
  // martelar a Z-API nos mesmos contatos sem foto pública repetidamente.
  const fimDaLista = contacts.length < BATCH

  // Se nada foi encontrado, o log do container (docker logs) tem o detalhe
  // real de cada tentativa (status HTTP + corpo) via [zapi:profile-picture].
  return NextResponse.json({
    success: true,
    processados: contacts.length,
    updated,
    semFoto,
    restantes,
    nextCursor,
    fimDaLista,
    ...(erroExemplo ? { erroExemplo } : {}),
  })
}

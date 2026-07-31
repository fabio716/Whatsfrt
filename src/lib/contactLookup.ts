// ═══════════════════════════════════════════════════════════════════════════
// Busca/cria o Contact certo pra um whatsappId que acabou de chegar num
// webhook, considerando a ambiguidade do 9º dígito dos celulares brasileiros.
//
// Bug que isso resolve: a Z-API (e às vezes a Evolution) nem sempre manda o
// número no mesmo formato pra um mesmo contato — ora com o 9 (13 dígitos),
// ora sem (12 dígitos). Como o Contact.whatsappId é único e o upsert antigo
// comparava a string exata, cada formato diferente criava um contato NOVO
// pro MESMO cliente — duplicando cadastro, perdendo histórico/atribuição de
// carteira e quebrando o roteamento da URA.
//
// Aqui, antes de criar, procuramos por QUALQUER variante (com/sem o 9) já
// cadastrada e reaproveitamos esse contato — preservando assignedUserId,
// chatStatus e histórico.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import type { Contact } from "@/generated/prisma/client"

// Dado "5543988654231" (com 9) devolve também "554388654231" (sem 9), e
// vice-versa. Números fora do padrão BR (ou grupos) não têm variante.
function phoneVariants(digits: string): string[] {
  if (!digits.startsWith("55")) return [digits]
  const ddi_ddd = digits.slice(0, 4) // "55" + DDD (2 dígitos)
  const rest = digits.slice(4)
  if (digits.length === 13 && rest.startsWith("9")) {
    return [digits, `${ddi_ddd}${rest.slice(1)}`]
  }
  if (digits.length === 12) {
    return [digits, `${ddi_ddd}9${rest}`]
  }
  return [digits]
}

export interface ContactUpsertData {
  // Nome vindo do provedor NESTE evento (senderName/pushName). Só aplica
  // update se vier preenchido — mensagens sem isso não devem apagar o nome
  // que já estava salvo.
  name?: string | null
  // Nome de fallback USADO SÓ NA CRIAÇÃO, quando `name` vier vazio (ex:
  // chatName ou o próprio whatsappId) — não sobrescreve contato existente.
  fallbackName?: string
  profilePhotoUrl?: string | null
}

// Substitui prisma.contact.upsert({where:{whatsappId}}) nos webhooks.
// Grupos (@g.us) não têm ambiguidade de 9º dígito — segue upsert normal.
export async function findOrCreateContact(
  whatsappId: string,
  data: ContactUpsertData,
): Promise<Contact> {
  const createName = data.name ?? data.fallbackName ?? whatsappId

  if (whatsappId.endsWith("@g.us")) {
    return prisma.contact.upsert({
      where: { whatsappId },
      create: {
        whatsappId,
        name: createName,
        profilePhotoUrl: data.profilePhotoUrl ?? null,
      },
      update: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.profilePhotoUrl ? { profilePhotoUrl: data.profilePhotoUrl } : {}),
      },
    })
  }

  const digits = whatsappId.replace("@s.whatsapp.net", "")
  const variants = phoneVariants(digits).map((d) => `${d}@s.whatsapp.net`)

  const existing = await prisma.contact.findFirst({
    where: { whatsappId: { in: variants } },
  })
  if (existing) {
    return prisma.contact.update({
      where: { id: existing.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.profilePhotoUrl ? { profilePhotoUrl: data.profilePhotoUrl } : {}),
      },
    })
  }

  return prisma.contact.create({
    data: {
      whatsappId,
      name: createName,
      profilePhotoUrl: data.profilePhotoUrl ?? null,
    },
  })
}

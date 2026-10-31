// ═══════════════════════════════════════════════════════════════════════════
// Opt-out: cliente pediu pra não receber ofertas ("SAIR", "parar", "não quero
// mais receber"...). Quem pede pra parar e continua recebendo é quem aperta
// "Denunciar" — a principal causa de bloqueio do número.
//
// Só tira o cliente das TRANSMISSÕES. A conversa normal continua: se ele
// escrever, a vendedora responde como sempre.
//
// Critério de propósito conservador (melhor deixar passar um pedido do que
// tirar quem não pediu): palavra sozinha na mensagem, ou frase inequívoca.
// "Cancelar" NÃO conta — quase sempre é sobre pedido, não sobre ofertas.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"

const SOZINHA = /^(sair|parar|pare|para|stop|descadastrar|descadastra|descadastre|remover|remova|me remova|me remove|me tira|me tire)$/

const FRASE = new RegExp([
  "nao quero (mais )?receber",
  "nao (desejo|quero) (mais )?(receber )?(essas |estas |as )?(mensagens|ofertas|promocoes|propagandas)",
  "(para|pare|parem|parar) de (me )?(mandar|enviar)",
  "nao (me )?(mande|mandem|envie|enviem) mais",
  "(me )?(tira|tire|remove|remova|exclua|exclui) (meu (numero|contato) )?(da|dessa|desta|de) lista",
  "(sair|me tirar) da lista",
].join("|"))

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function pedeOptOut(texto: string | null | undefined): boolean {
  if (!texto) return false
  const t = normalizar(texto)
  if (!t || t.length > 160) return false
  return SOZINHA.test(t) || FRASE.test(t)
}

// Chamado quando chega mensagem do cliente. Marca uma vez só (mantém a data
// do primeiro pedido). Nunca lança erro — opt-out não pode derrubar o
// recebimento da mensagem.
export async function registrarOptOutSePedido(contactId: string, texto: string | null | undefined): Promise<boolean> {
  if (!pedeOptOut(texto)) return false
  try {
    const r = await prisma.contact.updateMany({
      where: { id: contactId, optOutAt: null },
      data: { optOutAt: new Date() },
    })
    if (r.count > 0) console.log(`[opt-out] contato ${contactId} pediu pra não receber ofertas`)
    return r.count > 0
  } catch (err) {
    console.error("[opt-out] falha ao registrar:", err instanceof Error ? err.message : err)
    return false
  }
}

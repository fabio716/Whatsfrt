import { createHmac, timingSafeEqual } from "crypto"

// ═══════════════════════════════════════════════════════════════════════════
// Comprovante de upload: prova que o arquivo /api/media/<nome> foi enviado
// por ESTA pessoa. Sem isso, a transmissão e o chat interno aceitavam qualquer
// endereço de arquivo vindo da tela — um agente podia apontar pro anexo de
// outro cliente ou de outra conversa (nomes começam com a hora do envio, dá
// pra adivinhar) e o sistema enviava/liberava o arquivo pra ele.
//
// HMAC com o JWT_SECRET (com um rótulo próprio, pra não servir como token de
// outra coisa). Não precisa de tabela: o upload devolve o comprovante, a
// tela manda de volta junto com o arquivo.
// ═══════════════════════════════════════════════════════════════════════════

function segredo(): string {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET ausente")
    return "dev-secret-change-me-32chars!!"
  }
  return s
}

export function gerarComprovante(userId: string, mediaUrl: string): string {
  return createHmac("sha256", segredo()).update(`upload:${userId}:${mediaUrl}`).digest("base64url")
}

export function comprovanteValido(userId: string, mediaUrl: string, comprovante: unknown): boolean {
  if (typeof comprovante !== "string" || !comprovante) return false
  const esperado = Buffer.from(gerarComprovante(userId, mediaUrl))
  const recebido = Buffer.from(comprovante)
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
}

// ═══════════════════════════════════════════════════════════════════════════
// Modo cautela das transmissões. Em 27/10/2026 o WhatsApp bloqueou o número
// por 24h depois de ~1.250 ofertas num dia só (26/10), com 3–8s entre uma e
// outra e ~18% de falhas (número inexistente). Depois de uma restrição o
// número fica "vigiado"; até a data abaixo a transmissão continua liberada,
// mas pequena, lenta e só pra quem conversou há pouco tempo:
//   • até 50 destinatários por transmissão;
//   • até 100 envios de transmissão por dia (todas somadas);
//   • só clientes que mandaram mensagem nos últimos 30 dias;
//   • 45 a 120 segundos entre um envio e outro.
// Atendimento normal (responder cliente) não é afetado.
//
// Pra mudar sem mexer no código: no .env do servidor,
//   TRANSMISSAO_CAUTELA_ATE=2026-11-03   (outra data)
//   TRANSMISSAO_CAUTELA_ATE=             (vazio = volta ao normal)
// e reiniciar o app.
// ═══════════════════════════════════════════════════════════════════════════

const PADRAO = "2026-11-10"

export const CAUTELA = {
  maxPorTransmissao: 50,
  maxPorDia: 100,
  diasConversa: 30,
  delayMin: 45,
  delayMax: 120,
}

export function cautelaAte(): Date | null {
  const valor = (process.env.TRANSMISSAO_CAUTELA_ATE ?? PADRAO).trim()
  if (!valor) return null
  // Só a data: vale até o fim do dia, no horário de Brasília.
  const ate = new Date(/^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T23:59:59-03:00` : valor)
  if (Number.isNaN(ate.getTime()) || ate.getTime() <= Date.now()) return null
  return ate
}

export function dataBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

// Meia-noite de hoje no horário de Brasília (contagem do limite diário).
export function inicioDoDiaBr(): Date {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  return new Date(`${hoje}T00:00:00-03:00`)
}

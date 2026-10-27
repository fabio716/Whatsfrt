// ═══════════════════════════════════════════════════════════════════════════
// Limites seguros das transmissões — PERMANENTES.
//
// Em 27/10/2026 o WhatsApp bloqueou o número por 24h depois de ~1.250
// ofertas num dia só (26/10), com 3–8s entre uma e outra e ~18% de falhas
// (número inexistente). Como o Z-API é conexão não oficial, um novo bloqueio
// pode virar banimento. Por decisão da FRT, a transmissão SEMPRE segue:
//   • até 50 destinatários por transmissão;
//   • até 100 envios de transmissão por dia (todas somadas);
//   • só clientes que mandaram mensagem nos últimos 30 dias;
//   • 45 a 120 segundos entre um envio e outro.
// Atendimento normal (responder cliente) não é afetado.
// Pra mudar algum limite, altere os números abaixo.
// ═══════════════════════════════════════════════════════════════════════════

export const LIMITES_SEGUROS = {
  maxPorTransmissao: 50,
  maxPorDia: 100,
  diasConversa: 30,
  delayMin: 45,
  delayMax: 120,
}

// Meia-noite de hoje no horário de Brasília (contagem do limite diário).
export function inicioDoDiaBr(): Date {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  return new Date(`${hoje}T00:00:00-03:00`)
}

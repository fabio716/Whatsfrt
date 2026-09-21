import { redis } from "@/lib/redis"

// ═══════════════════════════════════════════════════════════════════════════
// Presença — quem está REALMENTE no sistema agora.
//
// Antes isso saía da lista de conexões SSE abertas, e por isso o painel
// mostrava a equipe inteira online num feriado. Três motivos:
//
//   1. O navegador só avisa que saiu quando fecha a conexão com educação.
//      Celular que dorme, aba fechada de repente e queda de rede não avisam
//      nada — o registro ficava lá até o servidor reiniciar.
//   2. O notificador global reconecta sozinho a cada 4s, então cada queda
//      podia deixar um registro órfão.
//   3. A batida do SSE é do servidor PARA o navegador: ela prova que o
//      servidor está vivo, não que tem alguém do outro lado.
//
// Agora quem diz "estou aqui" é o navegador, a cada 30s, e só enquanto a
// tela está à vista. A marca vale 90s (perdoa duas batidas atrasadas) e
// expira sozinha — sem rotina de limpeza pra dar manutenção.
// ═══════════════════════════════════════════════════════════════════════════

const PREFIXO = "whatsfrt:presence:"

// Validade da marca. 3x o intervalo de batida: rede engasgada não derruba
// alguém que está trabalhando.
const VALIDADE_SEG = 90

/** Registra que este usuário está com o sistema aberto e à vista. */
export async function marcarPresenca(userId: string): Promise<void> {
  await redis.setex(`${PREFIXO}${userId}`, VALIDADE_SEG, "1")
}

/**
 * Ids de quem bateu ponto nos últimos 90s.
 *
 * Redis fora do ar devolve conjunto vazio (o wrapper já cai em fallback) —
 * o painel mostra todos como offline em vez de inventar presença.
 */
export async function idsOnline(): Promise<Set<string>> {
  const chaves = await redis.keys(`${PREFIXO}*`)
  return new Set(chaves.map((k) => k.slice(PREFIXO.length)).filter(Boolean))
}

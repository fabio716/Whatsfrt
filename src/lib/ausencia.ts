// ═══════════════════════════════════════════════════════════════════════════
// "Ausente": a pessoa avisa que saiu por alguns minutos (banheiro, saiu da posição,
// resolver algo). Enquanto durar:
//   • o gerente virtual NÃO cobra nem trava a tela dela;
//   • ela fica fora do rodízio de clientes novos;
//   • o assistente virtual avisa UMA vez cada cliente dela que escrever
//     ("já volta"), e ela recebe o resumo ao voltar.
// Fica só no Redis (some sozinho no fim do prazo). Nada vai para o banco.
// ═══════════════════════════════════════════════════════════════════════════
import { redis } from "@/lib/redis"

export const MOTIVOS = {
  BANHEIRO: { rotulo: "🚻 Banheiro", minutos: 10 },
  POSICAO: { rotulo: "🚶 Saí da posição", minutos: 15 },
  RESOLVER: { rotulo: "🧩 Resolver algo", minutos: 30 },
} as const
export type MotivoAusencia = keyof typeof MOTIVOS

export interface Ausencia { motivo: MotivoAusencia; desde: number; ate: number }

const P = "ausente:"
const FIM = "ausente:fim:"

export async function ausenciaDe(userId: string): Promise<Ausencia | null> {
  const bruto = await redis.get(`${P}${userId}`)
  if (!bruto) return null
  try {
    const a = JSON.parse(bruto) as Ausencia
    return a.ate > Date.now() ? a : null
  } catch { return null }
}

export async function idsAusentes(): Promise<Map<string, Ausencia>> {
  const mapa = new Map<string, Ausencia>()
  const chaves = (await redis.keys(`${P}*`)).filter((k) => !k.startsWith(FIM) && !k.startsWith(`${P}aviso:`) && !k.startsWith(`${P}rec:`))
  for (const k of chaves) {
    const id = k.slice(P.length)
    const a = await ausenciaDe(id)
    if (a) mapa.set(id, a)
  }
  return mapa
}

export async function iniciarAusencia(userId: string, motivo: MotivoAusencia): Promise<Ausencia> {
  const agora = Date.now()
  const a: Ausencia = { motivo, desde: agora, ate: agora + MOTIVOS[motivo].minutos * 60_000 }
  await redis.setex(`${P}${userId}`, MOTIVOS[motivo].minutos * 60 + 5, JSON.stringify(a))
  // Quando acabar, a contagem de atraso dela recomeça (ninguém é cobrado pelo tempo ausente).
  await redis.setex(`${FIM}${userId}`, 12 * 3600, String(a.ate))
  return a
}

// Volta antes do prazo (ou confirma o fim). Devolve quantos clientes escreveram enquanto estava fora.
export async function encerrarAusencia(userId: string): Promise<number> {
  await redis.del(`${P}${userId}`)
  await redis.setex(`${FIM}${userId}`, 12 * 3600, String(Date.now()))
  const recados = await redis.keys(`${P}rec:${userId}:*`)
  for (const k of recados) await redis.del(k)
  return recados.length
}

// Quando a ausência dela terminou (para a contagem de atraso recomeçar dali).
export async function fimDaUltimaAusencia(userId: string): Promise<number> {
  return Number((await redis.get(`${FIM}${userId}`)) ?? 0) || 0
}

// Primeiro recado do cliente nesta ausência? (para avisar uma única vez)
export async function primeiroRecado(userId: string, contactId: string, ate: number): Promise<boolean> {
  const chave = `${P}rec:${userId}:${contactId}`
  const novo = (await redis.incr(chave)) === 1
  if (novo) await redis.expire(chave, Math.max(60, Math.ceil((ate - Date.now()) / 1000) + 900))
  return novo
}

// ═══════════════════════════════════════════════════════════════════════════
// "Ausente": a pessoa avisa que saiu por alguns minutos. Não há lista de motivos: ela
// pode (se quiser) escrever um texto livre, que só o administrador vê. O que sempre
// fica registrado é quando saiu e quando voltou.
// Enquanto durar:
//   • o gerente virtual NÃO cobra nem trava a tela dela;
//   • ela fica fora do rodízio de clientes novos;
//   • o assistente virtual avisa UMA vez cada cliente dela que escrever ("já volta"),
//     e ela recebe o resumo ao voltar.
// O estado "ausente agora" fica no Redis; o histórico (início, fim, duração) vai
// para a tabela `ausencias` (guardada por 90 dias). Prazo máximo: 30 min; depois
// disso a ausência encerra sozinha (e fica marcada como "sem toque em Voltei").
// ═══════════════════════════════════════════════════════════════════════════
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"

export const PRAZO_MAXIMO_MIN = 30

export interface Ausencia { desde: number; ate: number; registroId: string }

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
  const chaves = (await redis.keys(`${P}*`)).filter((k) => !k.startsWith(FIM) && !k.startsWith(`${P}rec:`))
  for (const k of chaves) {
    const id = k.slice(P.length)
    const a = await ausenciaDe(id)
    if (a) mapa.set(id, a)
  }
  return mapa
}

export async function iniciarAusencia(userId: string, motivo?: string): Promise<Ausencia> {
  const ja = await ausenciaDe(userId)
  if (ja) return ja // já está ausente: não cria outro registro
  const agora = Date.now()
  const texto = (motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 80)
  const reg = await prisma.ausencia.create({ data: { userId, inicio: new Date(agora), motivo: texto || null } })
  const a: Ausencia = { desde: agora, ate: agora + PRAZO_MAXIMO_MIN * 60_000, registroId: reg.id }
  await redis.setex(`${P}${userId}`, PRAZO_MAXIMO_MIN * 60 + 5, JSON.stringify(a))
  await redis.setex(`${FIM}${userId}`, 12 * 3600, String(a.ate))
  return a
}

// Voltou (toque em "Voltei"). Devolve a duração e quantos clientes escreveram enquanto estava fora.
export async function encerrarAusencia(userId: string): Promise<{ minutos: number; recados: number }> {
  const a = await ausenciaDe(userId)
  const agora = Date.now()
  let minutos = 0
  if (a) {
    minutos = Math.max(0, Math.round((agora - a.desde) / 60_000))
    await prisma.ausencia.updateMany({ where: { id: a.registroId, fim: null }, data: { fim: new Date(agora), duracaoMin: minutos } })
  }
  await redis.del(`${P}${userId}`)
  await redis.setex(`${FIM}${userId}`, 12 * 3600, String(agora))
  const recados = await redis.keys(`${P}rec:${userId}:*`)
  for (const k of recados) await redis.del(k)
  return { minutos, recados: recados.length }
}

// Prazo máximo vencido sem "Voltei": fecha o registro com o prazo cheio e marca.
export async function fecharAusenciasVencidas(): Promise<number> {
  const corte = new Date(Date.now() - PRAZO_MAXIMO_MIN * 60_000)
  const abertas = await prisma.ausencia.findMany({ where: { fim: null, inicio: { lt: corte } }, take: 100, select: { id: true, inicio: true } })
  for (const r of abertas) {
    await prisma.ausencia.updateMany({
      where: { id: r.id, fim: null },
      data: { fim: new Date(r.inicio.getTime() + PRAZO_MAXIMO_MIN * 60_000), duracaoMin: PRAZO_MAXIMO_MIN, autoEncerrada: true },
    })
  }
  return abertas.length
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

// ═══════════════════════════════════════════════════════════════════════════
// Parecer do gerente virtual sobre um retorno marcado como feito. Lê o relato
// da pessoa, o canal, os horários e as últimas mensagens do chat e SUGERE:
//   CONCLUIDO · AGUARDANDO_CLIENTE · NAO_CONCLUIDO
// Só sugere — quem fecha é o administrador. Resultado guardado 6 h no Redis.
// Vão para a IA: nome do cliente, o relato e os últimos trechos da conversa
// (cada um cortado em 160 caracteres), como já acontece no atendente virtual.
// ═══════════════════════════════════════════════════════════════════════════
import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { aiConfigured } from "@/lib/ai"

const MODELO = "claude-sonnet-5-5"
const SEIS_HORAS = 6 * 60 * 60

export type Veredito = "CONCLUIDO" | "AGUARDANDO_CLIENTE" | "NAO_CONCLUIDO"
export interface Parecer { veredito: Veredito; motivo: string; falta?: string }

const REGRAS = `Você é o gerente virtual da FRT Automação. Confere se um RETORNO agendado a um cliente foi realmente feito, com base no que o atendente escreveu e no histórico do chat.

CLASSIFIQUE em UMA opção:
- CONCLUIDO: há prova de que a pessoa falou com o cliente e o assunto do retorno foi tratado, resolvido ou encaminhado com um próximo passo claro (o relato bate com o chat e com o combinado).
- AGUARDANDO_CLIENTE: a pessoa FEZ o contato (há mensagem dela no chat), mas o assunto ainda depende da resposta do cliente. O retorno em si foi feito; falta acompanhar. Recomende agendar novo lembrete.
- NAO_CONCLUIDO: não há prova de contato, o relato não corresponde ao combinado, não diz o que foi feito (só repete o que o cliente disse), ou o chat contradiz o relato.

CRITÉRIOS: compare o COMBINADO (o que o retorno devia resolver) com o RELATO e com as MENSAGENS. Relato vago ("ok", "feito") ou que só descreve o problema do cliente não prova nada. Contato antes do horário combinado é válido. Canal telefone/e-mail não deixa prova no chat: avalie só pela coerência do relato e diga que não dá para confirmar.

RESPONDA exatamente neste formato, sem mais nada:
VEREDITO: CONCLUIDO | AGUARDANDO_CLIENTE | NAO_CONCLUIDO
MOTIVO: uma frase curta, em português, falando com o administrador (máx. 220 caracteres).
FALTA: SÓ se o veredito for NAO_CONCLUIDO — o que a PESSOA precisa fazer ou registrar para o retorno ser aceito, falando diretamente com ela, de forma objetiva e educada (máx. 220 caracteres). Nos outros casos, escreva FALTA: -`

const ROTULO: Record<string, string> = { WHATSAPP: "WhatsApp", FRTWHATS: "frtwhats", TELEFONE: "Telefone", EMAIL: "E-mail" }
const corta = (t: string, n: number) => t.replace(/\s+/g, " ").trim().slice(0, n)

export function lerParecer(texto: string): Parecer | null {
  const v = texto.match(/VEREDITO:\s*(CONCLUIDO|AGUARDANDO_CLIENTE|NAO_CONCLUIDO)/i)?.[1]?.toUpperCase()
  const m = texto.match(/MOTIVO:\s*([^\n]+)/i)?.[1]?.trim()
  const f = texto.match(/FALTA:\s*([\s\S]+)/i)?.[1]?.trim()
  if (!v || !m) return null
  const falta = f && f !== "-" ? f.replace(/\s+/g, " ").slice(0, 260) : undefined
  return { veredito: v as Veredito, motivo: m.replace(/\s+/g, " ").slice(0, 260), ...(falta ? { falta } : {}) }
}

export async function parecerDoRetorno(id: string): Promise<Parecer | "SEM_IA" | null> {
  if (!aiConfigured()) return "SEM_IA"
  const r = await prisma.contactReminder.findUnique({
    where: { id },
    select: {
      dueAt: true, doneAt: true, note: true, canal: true, relato: true, contactId: true, createdAt: true,
      user: { select: { name: true } }, contact: { select: { name: true } },
    },
  })
  if (!r || !r.doneAt) return null
  const chave = `gerente:parecer:${id}:${r.doneAt.getTime()}`
  const guardado = await redis.get(chave)
  if (guardado) { try { return JSON.parse(guardado) as Parecer } catch { /* refaz */ } }

  const mensagens = (await prisma.message.findMany({
    where: { contactId: r.contactId, isBroadcast: false, createdAt: { gte: new Date(r.createdAt.getTime() - 24 * 3_600_000) } },
    orderBy: { createdAt: "desc" }, take: 12,
    select: { body: true, direction: true, viaAtendente: true, createdAt: true, agent: { select: { name: true } } },
  })).reverse()
  const hora = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  const chat = mensagens.map((m) =>
    `[${hora(m.createdAt)}] ${m.direction === "INBOUND" ? "CLIENTE" : m.viaAtendente ? "ROBÔ" : `ATENDENTE(${(m.agent?.name ?? "equipe").split(" ")[0]})`}: ${corta(m.body || "(anexo)", 160)}`).join("\n")

  const pedido =
    `CLIENTE: ${r.contact.name}\nATENDENTE RESPONSÁVEL: ${r.user.name}\nCOMBINADO: ${corta(r.note || "(sem descrição)", 300)}\n` +
    `HORÁRIO COMBINADO: ${hora(r.dueAt)} · MARCADO COMO FEITO: ${hora(r.doneAt)}\nCANAL INFORMADO: ${ROTULO[r.canal ?? ""] ?? "—"}\n` +
    `RELATO DA PESSOA: ${corta(r.relato ?? "", 500)}\n\n<chat> (últimas mensagens, da mais antiga para a mais recente)\n${chat || "(sem mensagens)"}\n</chat>`

  try {
    const client = new Anthropic()
    const resp = await client.messages.create({
      model: MODELO, max_tokens: 400,
      system: [{ type: "text", text: REGRAS, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: pedido }],
    })
    if (resp.stop_reason === "refusal") return null
    const texto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("")
    const parecer = lerParecer(texto)
    if (!parecer) return null
    await redis.set(chave, JSON.stringify(parecer))
    await redis.expire(chave, SEIS_HORAS)
    return parecer
  } catch (err) {
    console.error("[gerenteParecer] falha:", err instanceof Error ? err.message : err)
    return null
  }
}

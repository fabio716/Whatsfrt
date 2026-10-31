// ═══════════════════════════════════════════════════════════════════════════
// Copiloto FRT — sugestão de resposta com IA (Claude / Anthropic).
// A IA NUNCA envia nada ao cliente: só devolve um rascunho que a vendedora
// revisa no composer. Conhecimento vem da tabela ai_knowledge (tela admin).
// ═══════════════════════════════════════════════════════════════════════════
import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-opus-5"

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

export interface SuggestInput {
  knowledge: string
  contactName: string
  empresa?: string | null
  temperature?: string | null
  tags: string[]
  notes?: string
  // Transcrição já formatada, uma linha por mensagem: "CLIENTE: ..." / "VENDEDORA: ..."
  transcript: string
  agentName: string
}

const SYSTEM_BASE = `Você é o Copiloto FRT: escreve rascunhos de resposta de WhatsApp em nome da equipe de vendas da FRT Automação Comercial e Bancária (Brasil).

REGRAS INEGOCIÁVEIS:
- Escreva APENAS o texto da resposta, pronto pra colar no WhatsApp. Sem título, sem aspas, sem explicações antes ou depois.
- Português do Brasil, tom profissional e humano, direto. Técnico quando o cliente pedir nível técnico.
- Sempre a favor da FRT, sem mentir e sem atacar ninguém (nem autorizadas, nem concorrentes).
- NUNCA invente: preço, prazo, estoque, especificação ou promessa que não esteja na base de conhecimento ou na conversa. Quando faltar um dado necessário, escreva o marcador [CONFIRMAR: o que falta] no lugar.
- Não prometa callback/prazo específico por conta própria — use [CONFIRMAR: prazo] se precisar.
- Comprimento: o suficiente pra resolver, sem enrolação. Mensagem de WhatsApp, não e-mail.
- Se o cliente está irritado: reconheça o ponto SEM se desmanchar em desculpas repetidas, e vá direto pra solução concreta.`

export async function suggestReply(input: SuggestInput): Promise<string> {
  const client = new Anthropic()

  const fichaParts = [
    `Nome: ${input.contactName}`,
    input.empresa ? `Empresa: ${input.empresa}` : null,
    input.temperature ? `Termômetro: ${input.temperature === "HOT" ? "quente (negociando)" : input.temperature === "WARM" ? "morno (interessado sem pressa)" : "frio"}` : null,
    input.tags.length ? `Etiquetas: ${input.tags.join(", ")}` : null,
    input.notes?.trim() ? `Notas da equipe: ${input.notes.trim()}` : null,
  ].filter(Boolean).join("\n")

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 1024,
    // Fallback automático: se o modelo recusar por política, a própria API
    // tenta outro modelo compatível na mesma chamada.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [
      { type: "text", text: SYSTEM_BASE },
      {
        type: "text",
        text: `BASE DE CONHECIMENTO DA FRT (fonte da verdade — use apenas isto como fatos da empresa):\n\n${input.knowledge || "(base de conhecimento ainda não preenchida — não afirme nenhum fato específico da empresa; use [CONFIRMAR: ...] para qualquer dado factual)"}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `FICHA DO CLIENTE:\n${fichaParts}\n\nVENDEDORA RESPONSÁVEL: ${input.agentName}\n\nCONVERSA (mais antiga → mais recente):\n${input.transcript}\n\nEscreva agora a PRÓXIMA resposta da vendedora ao cliente.`,
      },
    ],
  })

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não pôde gerar sugestão para esta conversa.")
  }
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
  if (!text) throw new Error("A IA devolveu resposta vazia — tente de novo.")
  return text
}

// ─── Próximo passo da venda ───────────────────────────────────────────────────
// Recomendação INTERNA pra vendedora (não é mensagem pro cliente): qual o
// próximo passo comercial e, se fizer sentido, em quantos dias retornar.
// Vira um atalho pra criar lembrete — nunca dispara nada sozinho.
export interface ProximoPasso {
  passo: string
  retornoDias: number | null
}

export async function suggestNextStep(input: SuggestInput): Promise<ProximoPasso> {
  const client = new Anthropic()
  const fichaParts = [
    `Nome: ${input.contactName}`,
    input.empresa ? `Empresa: ${input.empresa}` : null,
    input.temperature ? `Termômetro: ${input.temperature}` : null,
    input.tags.length ? `Etiquetas: ${input.tags.join(", ")}` : null,
    input.notes?.trim() ? `Notas da equipe: ${input.notes.trim()}` : null,
  ].filter(Boolean).join("\n")

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 200,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: `Você orienta vendedoras da FRT Automação Comercial e Bancária. Leia a conversa de WhatsApp e diga, para a VENDEDORA (não para o cliente), qual o próximo passo comercial concreto.
Responda EXATAMENTE em duas linhas, sem mais nada:
PASSO: <uma frase curta, até 110 caracteres, verbo no infinitivo — ex: "Enviar orçamento da HT 880 com frete para Londrina">
RETORNO: <número de dias até retomar o contato (0 = hoje), ou "nenhum" se o cliente está respondendo agora ou a venda foi encerrada>
Nunca sugira mandar mensagem em massa, insistir com quem pediu para parar, ou contatar quem não respondeu várias vezes seguidas — nesse caso sugira outro canal (ligação) ou aguardar.`,
    messages: [
      {
        role: "user",
        content: `FICHA DO CLIENTE:\n${fichaParts}\n\nCONVERSA (mais antiga → mais recente):\n${input.transcript}`,
      },
    ],
  })
  if (response.stop_reason === "refusal") throw new Error("A IA não pôde analisar esta conversa.")

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
  const passo = text.match(/PASSO:\s*(.+)/i)?.[1]?.trim().slice(0, 160) ?? ""
  if (!passo) throw new Error("A IA devolveu resposta vazia — tente de novo.")
  const ret = text.match(/RETORNO:\s*(\d+)/i)
  const retornoDias = ret ? Math.min(60, Math.max(0, Number(ret[1]))) : null
  return { passo, retornoDias }
}

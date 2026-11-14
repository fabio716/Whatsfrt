import type { Humor } from "@/components/ui/Mascote"

// Falas do mascote quando a pessoa tem retorno pendente. Tom de brincadeira
// (o mascote "leva bronca do chefe"), sem apontar ninguém: só a própria pessoa vê.

export interface ItemCobranca {
  id: string
  contactId: string
  cliente: string
  dueAt: string
  // Minutos desde o horário combinado: negativo = ainda vai vencer.
  minAtraso: number
}

export interface TextoCobranca {
  humor: Humor
  texto: string
  opcoes: { rotulo: string; id: "agora" | "telefone" | "depois" }[]
}

const quanto = (min: number): string => {
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`
}
const hora = (iso: string): string => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

const OPCOES: TextoCobranca["opcoes"] = [
  { rotulo: "Vou agora! 🏃", id: "agora" },
  { rotulo: "Liguei por telefone", id: "telefone" },
  { rotulo: "Daqui a 15 min", id: "depois" },
]

export function textoCobranca(nome: string | null, itens: ItemCobranca[]): TextoCobranca {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0]
  const oi = primeiro ? `${primeiro}` : "Ei"
  const pior = itens[0] // o mais antigo
  const mais = itens.length > 1 ? ` (e mais ${itens.length - 1})` : ""
  if (pior.minAtraso < 0) {
    return { humor: "pedindo", texto: `${oi}! Daqui a ${quanto(-pior.minAtraso)} tem retorno com ${pior.cliente}${mais}. Já vai se preparando? 😉`, opcoes: OPCOES.slice(0, 1).concat(OPCOES.slice(2)) }
  }
  if (pior.minAtraso <= 30) {
    return { humor: "pedindo", texto: `${oi}! Tem retorno do ${pior.cliente} marcado pra ${hora(pior.dueAt)}${mais}. Atende pra eu não levar bronca! 🥺`, opcoes: OPCOES }
  }
  if (pior.minAtraso <= 120) {
    return { humor: "preocupado", texto: `${oi}... o ${pior.cliente} está esperando desde ${hora(pior.dueAt)}${mais}. Se o chefe ver, quem leva bronca sou eu! 😅`, opcoes: OPCOES }
  }
  return { humor: "preocupado", texto: `${oi}, pelo amor! 😱 O ${pior.cliente} espera há ${quanto(pior.minAtraso)}${mais}. O chefe vai me dar uma bronca (e sobra pra nós dois)!`, opcoes: OPCOES }
}

export function textoFesta(qtd: number): string {
  return qtd > 1
    ? `Boaaa! Você atendeu ${qtd} retornos e me salvou de ${qtd} broncas! 🎉`
    : "Boaaa! Atendeu o retorno e me salvou da bronca! Você é demais! 🎉"
}

export const FALAS = {
  agora: "Isso! Corre lá! 🏃",
  telefone: "Anotado! Dica: manda um 'oi' no chat pro chefe ver que você falou com o cliente 😉",
  depois: "Tá bom... mas não demora, hein? 😬",
  ignorou: "Vou ficar de olho! 👀",
}

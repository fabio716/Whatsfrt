import type { Humor } from "@/components/ui/Mascote"
import {
  COBRANCA_ATRASADO, COBRANCA_CRITICO, COBRANCA_FUTURO, COBRANCA_RECENTE, FESTA_UM, FESTA_VARIOS,
  preencher, RESP_AGORA, RESP_DEPOIS, RESP_IGNOROU, RESP_TELEFONE, sortear,
} from "./mascoteRepertorio"

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
  const pior = itens[0] // o mais antigo
  const dados = {
    oi: primeiro || "Ei",
    cliente: pior.cliente,
    hora: hora(pior.dueAt),
    quanto: quanto(pior.minAtraso < 0 ? -pior.minAtraso : pior.minAtraso),
    mais: itens.length > 1 ? ` (e mais ${itens.length - 1})` : "",
  }
  const [grupo, chave, humor, opcoes]: [readonly string[], string, Humor, TextoCobranca["opcoes"]] =
    pior.minAtraso < 0 ? [COBRANCA_FUTURO, "cob_futuro", "pedindo", OPCOES.slice(0, 1).concat(OPCOES.slice(2))]
    : pior.minAtraso <= 30 ? [COBRANCA_RECENTE, "cob_recente", "pedindo", OPCOES]
    : pior.minAtraso <= 120 ? [COBRANCA_ATRASADO, "cob_atrasado", "preocupado", OPCOES]
    : [COBRANCA_CRITICO, "cob_critico", "preocupado", OPCOES]
  return { humor, texto: preencher(sortear(chave, grupo).item, dados), opcoes }
}

export function textoFesta(qtd: number): string {
  return qtd > 1
    ? preencher(sortear("festa_varios", FESTA_VARIOS).item, { qtd: String(qtd) })
    : sortear("festa_um", FESTA_UM).item
}

// Resposta aos botões da cobrança — sorteada a cada uso, sem repetir.
export const FALAS = {
  get agora() { return sortear("resp_agora", RESP_AGORA).item },
  get telefone() { return sortear("resp_telefone", RESP_TELEFONE).item },
  get depois() { return sortear("resp_depois", RESP_DEPOIS).item },
  get ignorou() { return sortear("resp_ignorou", RESP_IGNOROU).item },
}

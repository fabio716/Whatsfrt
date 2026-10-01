// Regras compartilhadas entre a tela de Transmissão (quem aparece) e a criação
// da transmissão (quem recebe) — as duas precisam bater, senão a tela mostra
// um número de destinatários e o envio sai pra outro.

import type { Prisma } from "@/generated/prisma/client"

// Carteira do agente: quem está com ele agora OU quem ele atendeu por último.
// Só assignedUserId não serve — encerrar o atendimento zera esse campo, e o
// cliente sumia da lista de transmissão do próprio vendedor.
export function carteiraDoAgente(userId: string): Prisma.ContactWhereInput {
  return { OR: [{ assignedUserId: userId }, { lastAgentUserId: userId }] }
}

// Chave pra agrupar o campo Empresa, que é digitado à mão: " Mercearia  Silva"
// e "mercearia silva" são a mesma empresa.
export function chaveEmpresa(empresa: string | null | undefined): string {
  return (empresa ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-menu de escolha de atendente(a) apos escolher um setor na URA.
//
// Alguns setores (Vendas, Assistencia) tem varios agentes atendendo. Ao inves
// de jogar o cliente na fila e deixar qualquer agente do setor assumir, a URA
// mostra os nomes e o cliente escolhe. Isso dá controle ao cliente (talvez
// ele conheca "a Roberta") e evita disputa entre agentes pela mesma fila.
//
// Sub-menus configurados hoje:
//   - VENDAS               → so vendedoras (dept=VENDAS)
//   - TECNICOS_ASSISTENCIA → tecnicos + secretaria (2 depts, com prefixo no
//                            nome pra deixar claro quem e cada um)
//
// Estado "esperando escolha" vive no Redis com TTL 15min. A chave guarda a
// LISTA de departamentos daquela sub-menu, entao quando o cliente responde a
// gente ja sabe de qual conjunto veio o menu — nao depende de re-consultar
// a config.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"

const AWAITING_TTL_SECONDS = 15 * 60
const awaitingKey = (whatsappId: string): string => `ura:awaiting-submenu:${whatsappId}`

export interface SubMenuConfig {
  // Emoji + primeira frase do sub-menu ("👥 Perfeito! Com qual vendedora…").
  title: string
  // Setores (User.department) elegiveis pra listar. Ordem so importa se
  // dois agentes tiverem o mesmo nome — a lista final e sempre em ordem
  // alfabetica de nome.
  departments: string[]
  // Prefixo no nome por departamento (ex: TECNICOS_ASSISTENCIA -> "Técnico ").
  // Vazio quando nao ha ambiguidade (Vendas so tem vendedoras).
  prefixByDept?: Record<string, string>
}

// Mapeamento: targetDepartment da opcao URA -> sub-menu que dispara.
// Se targetDepartment nao esta aqui, o setor vai direto pra Fila de espera
// (comportamento default). Setores com 1 pessoa ou sem escolha semantica
// (Financeiro, Expedicao) nao precisam de sub-menu.
export const SUB_MENU_BY_DEPARTMENT: Record<string, SubMenuConfig> = {
  VENDAS: {
    title: "👥 Perfeito! Com qual vendedora você quer falar?",
    departments: ["VENDAS"],
  },
  TECNICOS_ASSISTENCIA: {
    title: "🔧 Perfeito! Com qual atendente da Assistência você quer falar?",
    departments: ["TECNICOS_ASSISTENCIA", "SECRETARIA_ASSISTENCIA"],
    prefixByDept: {
      TECNICOS_ASSISTENCIA: "Técnico ",
      SECRETARIA_ASSISTENCIA: "Secretária ",
    },
  },
}

export async function markAwaitingSubMenu(
  whatsappId: string,
  departments: string[],
): Promise<void> {
  await redis.setex(awaitingKey(whatsappId), AWAITING_TTL_SECONDS, departments.join(","))
}

export async function getAwaitingSubMenu(whatsappId: string): Promise<string[] | null> {
  const v = await redis.get(awaitingKey(whatsappId))
  if (!v) return null
  return v.split(",").filter(Boolean)
}

export async function clearAwaitingSubMenu(whatsappId: string): Promise<void> {
  await redis.del(awaitingKey(whatsappId))
}

export interface SubMenuAgent {
  id: string
  name: string
  department: string
}

// Agentes ativos dos departamentos passados, em ordem alfabetica de nome.
export async function getAgentsForSubMenu(
  departments: string[],
): Promise<SubMenuAgent[]> {
  const users = await prisma.user.findMany({
    where: {
      role: "AGENT",
      isActive: true,
      department: { in: departments as never[] },
    },
    select: { id: true, name: true, department: true },
    orderBy: { name: "asc" },
  })
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    department: u.department ?? "",
  }))
}

// Monta o texto do sub-menu, aplicando prefixo por dept quando definido.
export function buildSubMenu(
  agents: SubMenuAgent[],
  cfg: SubMenuConfig,
): string {
  const linhas = agents
    .map((a, i) => {
      const prefix = cfg.prefixByDept?.[a.department] ?? ""
      return `${i + 1}️⃣  ${prefix}${a.name}`
    })
    .join("\n")
  return (
    cfg.title +
    "\n\n" +
    linhas +
    "\n\nResponda com o número da opção."
  )
}

// Traduz o digito escolhido pelo cliente no agente correspondente.
export function pickAgentByDigit(
  agents: SubMenuAgent[],
  digit: string,
): SubMenuAgent | null {
  const n = Number.parseInt(digit.trim(), 10)
  if (!Number.isFinite(n) || n < 1 || n > agents.length) return null
  return agents[n - 1] ?? null
}

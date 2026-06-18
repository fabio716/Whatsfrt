// ═══════════════════════════════════════════════════════════════════════════
// Anti-spam helpers — protege a operação de cair no radar da Meta.
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma"
import { MessageDirection } from "@/generated/prisma/enums"

// Normaliza uma mensagem para detectar templates iguais ainda que personalizados
// (mudou só o nome). Estratégia:
//   - lowercase
//   - remove acentos
//   - remove pontuação e emojis
//   - remove sequências de palavras "tipo nome próprio" (Capitalizadas)
//   - mantém primeiros 80 chars (cobertura ampla)
export function normalizeForSpamCheck(text: string): string {
  return text
    .normalize("NFD").replace(/\p{M}/gu, "")            // acentos
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, " ") // emojis
    .replace(/\b[a-z]+(?:\s+[a-z]+)*\b/g, (m) => m)     // mantém palavras
    .replace(/\b\w*\d\w*\b/g, " ")                       // números/tokens com dígitos
    .replace(/[^\w\s]/g, " ")                            // pontuação
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

export interface SpamCheckResult {
  isSuspicious: boolean
  similarCount: number
  recentTotal: number
}

// Conta quantas das últimas N mensagens deste agente têm o MESMO template
// normalizado. Se 3 ou mais, é spam de template (alta chance de WhatsApp dropar).
export async function checkTemplateSpam(
  agentId: string,
  text: string,
  windowHours: number = 2,
): Promise<SpamCheckResult> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000)
  const recent = await prisma.message.findMany({
    where: {
      agentId,
      direction: MessageDirection.OUTBOUND,
      createdAt: { gte: since },
    },
    select: { body: true },
    take: 50,
    orderBy: { createdAt: "desc" },
  })

  const target = normalizeForSpamCheck(text)
  if (target.length < 10) return { isSuspicious: false, similarCount: 0, recentTotal: recent.length }

  const similar = recent.filter((m) => normalizeForSpamCheck(m.body) === target).length
  return {
    isSuspicious: similar >= 3,
    similarCount: similar,
    recentTotal: recent.length,
  }
}

// Conta mensagens OUTBOUND iniciadas pelo agente HOJE (desde meia-noite).
// Usado para barrar quando ultrapassa o limite configurado em User.
export async function getDailyMessageCount(agentId: string): Promise<number> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return prisma.message.count({
    where: {
      agentId,
      direction: MessageDirection.OUTBOUND,
      createdAt: { gte: todayStart },
    },
  })
}

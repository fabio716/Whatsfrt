import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"
import type { UraSessionData, UraNodeType } from "./types"

// ═══════════════════════════════════════════════════════════════════════════
// URA Session Manager (Redis + PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

const SESSION_TTL = 24 * 60 * 60 // 24 horas em segundos
const SESSION_PREFIX = "ura:session:"

export class UraSessionManager {
  /**
   * Cria ou atualiza uma sessão da URA
   */
  static async createOrUpdate(
    whatsappId: string,
    data: Partial<UraSessionData>
  ): Promise<UraSessionData> {
    const existing = await this.get(whatsappId)
    
    const session: UraSessionData = {
      whatsappId,
      currentNode: data.currentNode || existing?.currentNode || "greeting",
      previousNode: data.previousNode || existing?.previousNode,
      isNightFlow: data.isNightFlow ?? existing?.isNightFlow ?? false,
      collectedName: data.collectedName || existing?.collectedName,
      collectedProfile: data.collectedProfile || existing?.collectedProfile,
      collectedSector: data.collectedSector || existing?.collectedSector,
      collectedSubject: data.collectedSubject || existing?.collectedSubject,
      collectedCooperative: data.collectedCooperative || existing?.collectedCooperative,
      collectedUF: data.collectedUF || existing?.collectedUF,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL * 1000),
    }

    // Salva no Redis
    const key = `${SESSION_PREFIX}${whatsappId}`
    await redis.setex(key, SESSION_TTL, JSON.stringify(session))

    // Persiste no BD (upsert)
    await prisma.uraSession.upsert({
      where: { whatsappId },
      create: {
        whatsappId,
        currentNode: session.currentNode,
        previousNode: session.previousNode,
        isNightFlow: session.isNightFlow,
        collectedName: session.collectedName,
        collectedProfile: session.collectedProfile,
        collectedSector: session.collectedSector,
        collectedSubject: session.collectedSubject,
        expiresAt: session.expiresAt,
      },
      update: {
        currentNode: session.currentNode,
        previousNode: session.previousNode,
        isNightFlow: session.isNightFlow,
        collectedName: session.collectedName,
        collectedProfile: session.collectedProfile,
        collectedSector: session.collectedSector,
        collectedSubject: session.collectedSubject,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
      },
    })

    return session
  }

  /**
   * Busca uma sessão (Redis first, fallback para BD)
   */
  static async get(whatsappId: string): Promise<UraSessionData | null> {
    const key = `${SESSION_PREFIX}${whatsappId}`
    
    // Tenta Redis primeiro
    const cached = await redis.get(key)
    if (cached) {
      return JSON.parse(cached) as UraSessionData
    }

    // Fallback para BD
    const dbSession = await prisma.uraSession.findUnique({
      where: { whatsappId },
    })

    if (!dbSession) return null

    // Reconstrói a sessão
    const session: UraSessionData = {
      whatsappId: dbSession.whatsappId,
      currentNode: dbSession.currentNode as UraNodeType,
      previousNode: dbSession.previousNode as UraNodeType | undefined,
      isNightFlow: dbSession.isNightFlow,
      collectedName: dbSession.collectedName || undefined,
      collectedProfile: dbSession.collectedProfile as "PF" | "PJ" | undefined,
      collectedSector: dbSession.collectedSector as "FINANCEIRO" | "SUPORTE" | "VENDAS" | undefined,
      collectedSubject: dbSession.collectedSubject || undefined,
      createdAt: dbSession.createdAt,
      updatedAt: dbSession.updatedAt,
      expiresAt: dbSession.expiresAt,
    }

    // Recarrega no Redis
    await redis.setex(key, SESSION_TTL, JSON.stringify(session))

    return session
  }

  /**
   * Deleta uma sessão (Redis + BD)
   */
  static async delete(whatsappId: string): Promise<void> {
    const key = `${SESSION_PREFIX}${whatsappId}`
    await redis.del(key)
    await prisma.uraSession.delete({
      where: { whatsappId },
    }).catch(() => null) // Ignora se não existir
  }

  /**
   * Navega para o nó anterior (botão "0 - Voltar")
   */
  static async goBack(whatsappId: string): Promise<UraSessionData | null> {
    const session = await this.get(whatsappId)
    if (!session || !session.previousNode) return null

    return this.createOrUpdate(whatsappId, {
      currentNode: session.previousNode,
      previousNode: undefined, // Limpa o histórico
    })
  }

  /**
   * Limpa sessões expiradas (cron job)
   */
  static async cleanExpired(): Promise<number> {
    const result = await prisma.uraSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })
    return result.count
  }
}

import Redis from "ioredis"

// ═══════════════════════════════════════════════════════════════════════════
// Redis Client com Fallback Robusto
// ═══════════════════════════════════════════════════════════════════════════

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379"
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 segundo

class RedisClient {
  private client: Redis | null = null
  private isConnected = false
  private retryCount = 0

  constructor() {
    this.connect()
  }

  private connect() {
    try {
      this.client = new Redis(REDIS_URL, {
        maxRetriesPerRequest: MAX_RETRIES,
        retryStrategy: (times) => {
          if (times > MAX_RETRIES) {
            console.error("[Redis] Max retries reached. Entering fallback mode.")
            this.isConnected = false
            return null
          }
          const delay = Math.min(times * RETRY_DELAY, 5000)
          console.warn(`[Redis] Retry ${times}/${MAX_RETRIES} in ${delay}ms`)
          return delay
        },
        reconnectOnError: (err) => {
          const targetErrors = ["READONLY", "ECONNREFUSED"]
          if (targetErrors.some((e) => err.message.includes(e))) {
            console.warn("[Redis] Reconnecting due to error:", err.message)
            return true
          }
          return false
        },
      })

      this.client.on("connect", () => {
        console.log("✅ [Redis] Connected successfully")
        this.isConnected = true
        this.retryCount = 0
      })

      this.client.on("error", (err) => {
        console.error("❌ [Redis] Error:", err.message)
        this.isConnected = false
      })

      this.client.on("close", () => {
        console.warn("⚠️  [Redis] Connection closed")
        this.isConnected = false
      })

      this.client.on("reconnecting", () => {
        this.retryCount++
        console.log(`🔄 [Redis] Reconnecting... (attempt ${this.retryCount})`)
      })
    } catch (err) {
      console.error("❌ [Redis] Failed to initialize:", err)
      this.isConnected = false
    }
  }

  /**
   * Executa comando com fallback seguro
   */
  private async safeExecute<T>(
    operation: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    if (!this.client || !this.isConnected) {
      console.warn("[Redis] Not connected. Using fallback.")
      return fallback
    }

    try {
      return await operation()
    } catch (err) {
      console.error("[Redis] Operation failed:", err)
      return fallback
    }
  }

  async get(key: string): Promise<string | null> {
    return this.safeExecute(() => this.client!.get(key), null)
  }

  async set(key: string, value: string): Promise<"OK" | null> {
    return this.safeExecute(() => this.client!.set(key, value), null)
  }

  async setex(key: string, seconds: number, value: string): Promise<"OK" | null> {
    return this.safeExecute(() => this.client!.setex(key, seconds, value), null)
  }

  async del(key: string): Promise<number> {
    return this.safeExecute(() => this.client!.del(key), 0)
  }

  async exists(key: string): Promise<number> {
    return this.safeExecute(() => this.client!.exists(key), 0)
  }

  async ttl(key: string): Promise<number> {
    return this.safeExecute(() => this.client!.ttl(key), -1)
  }

  async keys(pattern: string): Promise<string[]> {
    return this.safeExecute(() => this.client!.keys(pattern), [])
  }

  async flushdb(): Promise<"OK" | null> {
    return this.safeExecute(() => this.client!.flushdb(), null)
  }

  // ─── List ops (usadas pela fila durável) ─────────────────────────────────
  async lpush(key: string, value: string): Promise<number> {
    return this.safeExecute(() => this.client!.lpush(key, value), 0)
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    return this.safeExecute(() => this.client!.lrem(key, count, value), 0)
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.safeExecute(() => this.client!.lrange(key, start, stop), [])
  }

  async llen(key: string): Promise<number> {
    return this.safeExecute(() => this.client!.llen(key), 0)
  }

  async ping(): Promise<string | null> {
    return this.safeExecute(() => this.client!.ping(), null)
  }

  // Move tudo da fila "processing" de volta para "inbound" (replay no boot).
  async drainProcessing(processingKey: string, inboundKey: string): Promise<number> {
    if (!this.client || !this.isConnected) return 0
    try {
      const items = await this.client.lrange(processingKey, 0, -1)
      if (items.length === 0) return 0
      const pipeline = this.client.multi()
      for (const item of items) pipeline.rpush(inboundKey, item)
      pipeline.del(processingKey)
      await pipeline.exec()
      return items.length
    } catch (err) {
      console.error("[Redis] drainProcessing failed:", err)
      return 0
    }
  }

  // Acesso ao ioredis cru — usado SÓ pelo worker para BLMOVE bloqueante,
  // que não pode rodar na conexão compartilhada.
  rawClient(): Redis | null {
    return this.client
  }

  isReady(): boolean {
    return this.isConnected && this.client !== null
  }

  getStatus(): { connected: boolean; retries: number } {
    return {
      connected: this.isConnected,
      retries: this.retryCount,
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.isConnected = false
    }
  }
}

// Constrói uma conexão Redis dedicada (para BLMOVE/BRPOP). Cada caller deve
// chamar `.quit()` no shutdown.
export function createDedicatedRedis(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // workers nunca rejeitam, só esperam
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * RETRY_DELAY, 5000),
  })
}

// Singleton
export const redis = new RedisClient()

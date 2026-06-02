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

// Singleton
export const redis = new RedisClient()

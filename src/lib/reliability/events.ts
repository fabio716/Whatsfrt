// Tipos e helpers compartilhados pelos módulos de reliability.

export type EvolutionState = "open" | "close" | "connecting" | "qrcode" | "unknown"

// Emite mudança de estado da conexão via SSE. Import dinâmico para evitar
// ciclo com sse-emitter (que não conhece o broadcaster de reliability).
export function emitConnectionStateChange(state: EvolutionState): void {
  void import("@/lib/sse-emitter").then((m) => {
    // Reusa o broadcaster — admins recebem; agentes recebem se o handler
    // do cliente filtrar por tipo (cliente decide se mostra banner).
    // Mensagem é genérica e útil para todos.
    try {
      m.broadcastSystemEvent({ type: "evolution_state", state })
    } catch (err) {
      console.error("[events] emitConnectionStateChange:", err)
    }
  })
}

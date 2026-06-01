// ─── SSE Payload Types ────────────────────────────────────────────────────────
// Exported so both the API routes (server) and client components (types only)
// can share the same shape.

export interface SSEContactInfo {
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: "IDLE" | "IN_URA" | "WAITING_AGENT" | "IN_SERVICE"
  assignedUserId: string | null
}

export interface SSEMessageData {
  id: string
  body: string
  direction: "INBOUND" | "OUTBOUND"
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
  createdAt: string
  agentId: string | null
  contactId: string
  mediaUrl?: string | null
  mediaType?: string | null
}

export interface SSENewMessagePayload {
  type: "new_message"
  data: SSEMessageData & { contact: SSEContactInfo }
}

export interface SSEMessageUpdatePayload {
  type: "message_update"
  data: { id: string; status: SSEMessageData["status"]; contactId: string }
}

export type SSEPayload = SSENewMessagePayload | SSEMessageUpdatePayload

// ─── Singleton client registry ────────────────────────────────────────────────
// NOTE: This module-level Set is process-local. It works correctly for a
// single-server deployment (local Docker). For multi-instance/serverless
// environments, replace with a pub/sub layer (e.g. Redis Pub/Sub).

const clients = new Set<ReadableStreamDefaultController<string>>()

export function addSSEClient(ctrl: ReadableStreamDefaultController<string>): void {
  clients.add(ctrl)
}

export function removeSSEClient(ctrl: ReadableStreamDefaultController<string>): void {
  clients.delete(ctrl)
}

export function broadcast(payload: SSEPayload): void {
  const chunk = `data: ${JSON.stringify(payload)}\n\n`
  for (const ctrl of clients) {
    try {
      ctrl.enqueue(chunk)
    } catch {
      clients.delete(ctrl)
    }
  }
}

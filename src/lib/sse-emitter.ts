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

type Role = "ADMIN" | "AGENT"

interface SSEClient {
  ctrl: ReadableStreamDefaultController<string>
  userId: string | null
  role: Role
}

const clients = new Set<SSEClient>()

export function addSSEClient(
  ctrl: ReadableStreamDefaultController<string>,
  userId: string | null,
  role: Role,
): void {
  clients.add({ ctrl, userId, role })
}

export function removeSSEClient(ctrl: ReadableStreamDefaultController<string>): void {
  for (const c of clients) {
    if (c.ctrl === ctrl) clients.delete(c)
  }
}

// Broadcast an event, scoping delivery so agents only receive events for the
// contacts assigned to them. Admins always receive everything.
// `ownerId` is the assignedUserId of the contact the event refers to.
export function broadcast(payload: SSEPayload, ownerId?: string | null): void {
  let owner: string | null | undefined = ownerId
  if (owner === undefined && payload.type === "new_message") {
    owner = payload.data.contact.assignedUserId
  }

  const chunk = `data: ${JSON.stringify(payload)}\n\n`
  for (const c of clients) {
    // Agents only get events for their own contacts. If the owner is unknown
    // (undefined) for a status update, deliver only to admins.
    const allowed = c.role === "ADMIN" || owner === c.userId
    if (!allowed) continue
    try {
      c.ctrl.enqueue(chunk)
    } catch {
      clients.delete(c)
    }
  }
}

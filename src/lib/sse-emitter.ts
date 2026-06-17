// ─── SSE Payload Types ────────────────────────────────────────────────────────
// Exported so both the API routes (server) and client components (types only)
// can share the same shape.

export interface SSEContactInfo {
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: "IDLE" | "IN_URA" | "WAITING_AGENT" | "IN_SERVICE" | "AWAITING_RATING"
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

// Eventos de sistema vão para TODOS os clientes (admin e agente). O UI decide
// o que mostrar — banner vermelho quando Evolution sai do "open", etc.
export interface SSESystemEventPayload {
  type: "evolution_state"
  state: "open" | "close" | "connecting" | "qrcode" | "unknown"
}

export type SSEPayload =
  | SSENewMessagePayload
  | SSEMessageUpdatePayload
  | SSESystemEventPayload

// ─── Singleton client registry ────────────────────────────────────────────────
// O Set é compartilhado entre bundles via globalThis + Symbol.for. Em Next.js
// standalone, route handlers (onde clientes se conectam via /api/sse) e o
// instrumentation.ts (onde o watchdog dispara broadcastSystemEvent) podem
// rodar em bundles distintos — module-level Set seria duplicado e eventos do
// watchdog nunca chegariam aos clientes conectados.

type Role = "ADMIN" | "AGENT"

interface SSEClient {
  ctrl: ReadableStreamDefaultController<string>
  userId: string
  role: Role
}

const CLIENTS_KEY = Symbol.for("whatsfrt.sse.clients")

type GlobalWithSlot = typeof globalThis & {
  [CLIENTS_KEY]?: Set<SSEClient>
}

function getClients(): Set<SSEClient> {
  const g = globalThis as GlobalWithSlot
  if (!g[CLIENTS_KEY]) g[CLIENTS_KEY] = new Set<SSEClient>()
  return g[CLIENTS_KEY]
}

// userId NUNCA pode ser null aqui — a rota SSE rejeita anônimos com 401.
// Manter o tipo estrito impede regressões que vazariam eventos.
export function addSSEClient(
  ctrl: ReadableStreamDefaultController<string>,
  userId: string,
  role: Role,
): void {
  getClients().add({ ctrl, userId, role })
}

export function removeSSEClient(ctrl: ReadableStreamDefaultController<string>): void {
  const clients = getClients()
  for (const c of clients) {
    if (c.ctrl === ctrl) clients.delete(c)
  }
}

// Broadcast irrestrito para TODOS os clientes conectados (admin + agente).
// Usado por eventos de sistema (status do Evolution, manutenção, etc.) que
// não têm dono específico e todo mundo precisa ver.
export function broadcastSystemEvent(payload: SSESystemEventPayload): void {
  const chunk = `data: ${JSON.stringify(payload)}\n\n`
  const clients = getClients()
  for (const c of clients) {
    try {
      c.ctrl.enqueue(chunk)
    } catch {
      clients.delete(c)
    }
  }
}

// Broadcast an event, scoping delivery so agents only receive events for the
// contacts assigned to them. Admins always receive everything.
// `ownerId` is the assignedUserId of the contact the event refers to.
export function broadcast(
  payload: SSENewMessagePayload | SSEMessageUpdatePayload,
  ownerId?: string | null,
): void {
  let owner: string | null | undefined = ownerId
  if (owner === undefined && payload.type === "new_message") {
    owner = payload.data.contact.assignedUserId
  }

  const chunk = `data: ${JSON.stringify(payload)}\n\n`
  const clients = getClients()
  for (const c of clients) {
    // Admin recebe tudo. Agente só recebe se for explicitamente o dono do
    // contato. Owner null/undefined NUNCA entrega para agentes (evita o bug
    // null===null que vazava contatos não atribuídos).
    const allowed =
      c.role === "ADMIN" || (typeof owner === "string" && owner === c.userId)
    if (!allowed) continue
    try {
      c.ctrl.enqueue(chunk)
    } catch {
      clients.delete(c)
    }
  }
}

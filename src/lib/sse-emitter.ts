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
  // body/mediaUrl/mediaType preenchidos só quando o evento é de uma EDIÇÃO ou
  // uma EXCLUSÃO de mensagem (não de mudança de status ✓/✓✓) — o client
  // aplica a troca em tempo real. Na exclusão, mediaUrl/mediaType vêm null.
  data: {
    id: string
    status: SSEMessageData["status"]
    contactId: string
    body?: string
    mediaUrl?: string | null
    mediaType?: string | null
  }
}

// Eventos de sistema vão para TODOS os clientes (admin e agente). O UI decide
// o que mostrar — banner vermelho quando Evolution sai do "open", etc.
export interface SSESystemEventPayload {
  type: "evolution_state"
  state: "open" | "close" | "connecting" | "qrcode" | "unknown"
}

// Chat interno da equipe — entregue apenas aos membros da conversa.
export interface SSEInternalMessagePayload {
  type: "internal_message"
  data: {
    id: string
    conversationId: string
    senderId: string
    senderName: string
    body: string
    mediaUrl: string | null
    mediaType: string | null
    createdAt: string
  }
}

// Edição/exclusão de mensagem do chat interno — entregue só aos membros da
// conversa. Na exclusão, mediaUrl/mediaType vêm null.
export interface SSEInternalMessageUpdatePayload {
  type: "internal_message_update"
  data: { id: string; conversationId: string; body: string; mediaUrl?: string | null; mediaType?: string | null }
}

// Solicitação de transferência de atendimento (autorização).
export interface SSETransferRequestPayload {
  type: "transfer_request"
  data: { id: string; contactName: string; requesterName: string }
}
export interface SSETransferDecisionPayload {
  type: "transfer_decision"
  data: { contactId: string; contactName: string; approved: boolean; deciderName: string }
}

export type SSEPayload =
  | SSENewMessagePayload
  | SSEMessageUpdatePayload
  | SSESystemEventPayload
  | SSEInternalMessagePayload
  | SSEInternalMessageUpdatePayload
  | SSETransferRequestPayload
  | SSETransferDecisionPayload

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

// Quem está com aba aberta agora — derivado direto do Set de clientes SSE.
// Cada userId pode aparecer mais de uma vez (multi-aba), por isso o Set
// final dedup pelo id. Usado pela home executiva pra distinguir agente
// REALMENTE online de agente apenas cadastrado.
export function getOnlineUserIds(): Set<string> {
  const online = new Set<string>()
  for (const c of getClients()) {
    online.add(c.userId)
  }
  return online
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

// Entrega um evento apenas aos usuários cujo id está em `userIds`. Usado pelo
// chat interno: só os membros da conversa recebem a mensagem (independente do
// role — aqui admin NÃO recebe tudo, senão vazaria conversa alheia).
export function broadcastToUsers(
  userIds: string[],
  payload:
    | SSEInternalMessagePayload
    | SSEInternalMessageUpdatePayload
    | SSETransferRequestPayload
    | SSETransferDecisionPayload,
): void {
  const targets = new Set(userIds)
  const chunk = `data: ${JSON.stringify(payload)}\n\n`
  const clients = getClients()
  for (const c of clients) {
    if (!targets.has(c.userId)) continue
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
    // Chat privado: admin recebe tudo; agente só recebe eventos de contatos da
    // própria carteira. Owner null/undefined nunca entrega para agentes.
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

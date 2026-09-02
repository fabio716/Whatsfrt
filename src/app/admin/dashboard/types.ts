export interface MessageData {
  id: string
  body: string
  direction: "INBOUND" | "OUTBOUND"
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
  createdAt: string
  agentId: string | null
  mediaUrl?: string | null
  mediaType?: string | null
  myReaction?: string | null
  theirReaction?: string | null
  whatsappKeyId?: string | null
  quotedMsgId?: string | null
  quotedBody?: string | null
  quotedSender?: string | null
}

export type ChatStatus = "IDLE" | "IN_URA" | "WAITING_AGENT" | "IN_SERVICE" | "AWAITING_RATING"

export interface ContactData {
  // Conversa arquivada pelo usuário logado (igual WhatsApp — só pra ele).
  archived?: boolean
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: ChatStatus
  assignedUserId: string | null
  messages: MessageData[]
}

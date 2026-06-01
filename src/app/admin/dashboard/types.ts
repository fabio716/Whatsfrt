export interface MessageData {
  id: string
  body: string
  direction: "INBOUND" | "OUTBOUND"
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
  createdAt: string
  agentId: string | null
  mediaUrl?: string | null
  mediaType?: string | null
}

export type ChatStatus = "IDLE" | "IN_URA" | "WAITING_AGENT" | "IN_SERVICE"

export interface ContactData {
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: ChatStatus
  assignedUserId: string | null
  messages: MessageData[]
}

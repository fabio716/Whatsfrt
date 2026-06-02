// ═══════════════════════════════════════════════════════════════════════════
// Motor da URA - Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

export type UraNodeType =
  // Fluxo Comercial
  | "greeting"
  | "ask_name"
  | "ask_profile"
  | "ask_sector"
  | "ask_support_type"
  | "ask_sales_type"
  | "ask_cooperative"
  | "ask_uf"
  // Fluxo Noturno
  | "night_greeting"
  | "night_ask_name"
  | "night_ask_sector"
  | "night_ask_subject"
  | "night_offer"
  | "night_finish"
  // Estados finais
  | "assign_to_agent"
  | "assign_to_queue"
  | "finish"

export interface UraSessionData {
  whatsappId: string
  currentNode: UraNodeType
  previousNode?: UraNodeType
  isNightFlow: boolean
  
  // Dados coletados
  collectedName?: string
  collectedProfile?: "PF" | "PJ"
  collectedSector?: "FINANCEIRO" | "SUPORTE" | "VENDAS"
  collectedSubject?: string
  collectedCooperative?: string
  collectedUF?: string
  
  // Metadata
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}

export interface UraNode {
  type: UraNodeType
  message: string
  options?: UraOption[]
  nextNode?: UraNodeType
  handler?: (session: UraSessionData, input: string) => Promise<UraTransition>
}

export interface UraOption {
  digit: string
  label: string
  nextNode: UraNodeType
}

export interface UraTransition {
  nextNode: UraNodeType
  message?: string
  updateData?: Partial<UraSessionData>
  assignTo?: {
    userId?: string
    department?: string
  }
  shouldFinish?: boolean
}

export interface BusinessHoursCheck {
  isOpen: boolean
  isLunchTime: boolean
  nextOpenTime?: Date
}

export interface WebhookMessage {
  key: {
    remoteJid: string // WhatsApp ID
    fromMe: boolean
    id: string
  }
  message: {
    conversation?: string
    extendedTextMessage?: {
      text: string
    }
  }
  messageTimestamp: number
  pushName?: string
}

export interface EvolutionWebhookPayload {
  event: string
  instance: string
  data: WebhookMessage
}

import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { UraStateMachine } from "@/lib/ura/stateMachine"
import type { EvolutionWebhookPayload } from "@/lib/ura/types"

// ═══════════════════════════════════════════════════════════════════════════
// Webhook da Evolution API - Resposta Rápida (200 OK imediato)
// ═══════════════════════════════════════════════════════════════════════════

// Comparação timing-safe do shared secret enviado no header `apikey`.
// Em produção é OBRIGATÓRIO. Em dev, ausência do segredo apenas loga.
function isAuthorizedWebhook(request: NextRequest): boolean {
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET
  if (!expected) {
    console.warn("[Webhook] EVOLUTION_WEBHOOK_SECRET não configurado — aceitando sem verificação.")
    return true
  }
  const received = request.headers.get("apikey") ?? ""
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedWebhook(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const payload: EvolutionWebhookPayload = await request.json()

    // Validação básica
    if (!payload.data || !payload.data.key) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const { key, message, pushName } = payload.data

    // Ignora mensagens enviadas por nós (fromMe = true)
    if (key.fromMe) {
      return NextResponse.json({ ok: true, skipped: "fromMe" })
    }

    // Extrai texto da mensagem
    const messageText =
      message?.conversation ||
      message?.extendedTextMessage?.text ||
      ""

    if (!messageText.trim()) {
      return NextResponse.json({ ok: true, skipped: "empty message" })
    }

    const whatsappId = key.remoteJid
    const contactName = pushName || "Contato"

    // ✅ RESPOSTA IMEDIATA (200 OK) - Evita timeout da Meta
    // Processamento assíncrono em background
    setImmediate(() => {
      UraStateMachine.processMessage(whatsappId, messageText, contactName)
        .catch((err) => {
          console.error("[Webhook] Error processing message:", err)
        })
    })

    return NextResponse.json({ ok: true, queued: true })
  } catch (err) {
    console.error("[Webhook] Error:", err)
    // Mesmo com erro, retorna 200 para não reenviar webhook
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 200 })
  }
}

// Health check
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    service: "Evolution API Webhook",
    timestamp: new Date().toISOString(),
  })
}

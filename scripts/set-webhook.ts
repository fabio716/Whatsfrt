/**
 * Reconfigura o webhook da instância Evolution API apontando para o host Next.js.
 * Uso: npx tsx scripts/set-webhook.ts
 */

const API_URL = process.env.EVOLUTION_API_URL ?? "http://localhost:8080"
const API_KEY = process.env.EVOLUTION_API_KEY ?? "whatsfrt-secret-key"
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME ?? "whatsfrt"
const WEBHOOK_URL =
  process.env.EVOLUTION_WEBHOOK_URL ??
  "http://host.docker.internal:3000/api/webhooks/evolution"

const payload = {
  webhook: {
    enabled: true,
    url: WEBHOOK_URL,
    byEvents: false,
    base64: false,
    events: [
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE",
      "MESSAGES_DELETE",
      "SEND_MESSAGE",
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
    ],
  },
}

async function main() {
  console.log(`Configurando webhook para a instância "${INSTANCE}"...`)
  console.log(`  URL do webhook: ${WEBHOOK_URL}`)

  const res = await fetch(`${API_URL}/webhook/set/${INSTANCE}`, {
    method: "POST",
    headers: {
      apikey: API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const body = await res.json()

  if (!res.ok) {
    console.error(`Falha (HTTP ${res.status}):`, body)
    process.exit(1)
  }

  console.log("Webhook configurado com sucesso:")
  console.log(JSON.stringify(body, null, 2))
}

main().catch((err) => {
  console.error("Erro inesperado:", err)
  process.exit(1)
})

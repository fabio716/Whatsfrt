/**
 * Sincroniza contatos e mensagens existentes do WhatsApp via Evolution API.
 * Uso: npx tsx scripts/sync-history.ts
 */

import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"
import { MessageDirection, MessageStatus } from "@/generated/prisma/enums"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const API_URL = process.env.EVOLUTION_API_URL ?? "http://localhost:8080"
const API_KEY = process.env.EVOLUTION_API_KEY ?? "whatsfrt-secret-key"
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME ?? "whatsfrt"
const HEADERS = { apikey: API_KEY, "Content-Type": "application/json" }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeJid(jid: string): string {
  if (!jid) return jid
  return jid.replace(/@(s\.whatsapp\.net|g\.us|c\.us)$/, "").concat(
    jid.endsWith("@g.us") ? "@g.us" : "@s.whatsapp.net"
  )
}

function extractText(message: Record<string, unknown>): string {
  if (!message) return ""
  return (
    (message.conversation as string) ??
    (message.extendedTextMessage as { text?: string })?.text ??
    (message.imageMessage as { caption?: string })?.caption ??
    (message.videoMessage as { caption?: string })?.caption ??
    (message.documentMessage as { caption?: string })?.caption ??
    ""
  )
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchChats(): Promise<unknown[]> {
  const res = await fetch(`${API_URL}/chat/findChats/${INSTANCE}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ instanceName: INSTANCE }),
  })
  if (!res.ok) throw new Error(`findChats falhou: HTTP ${res.status}`)
  const data = await res.json() as unknown[]
  return Array.isArray(data) ? data : []
}

async function fetchMessages(remoteJid: string, limit = 50): Promise<unknown[]> {
  const res = await fetch(`${API_URL}/chat/findMessages/${INSTANCE}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ where: { key: { remoteJid } }, limit }),
  })
  if (!res.ok) return []
  const data = await res.json() as { messages?: { records?: unknown[] } }
  return data?.messages?.records ?? []
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Sincronizando histórico da instância "${INSTANCE}"...\n`)

  // Buscar todos os chats (já contém remoteJid, pushName e profilePicUrl)
  const chats = await fetchChats()
  const individualChats = chats.filter((c) => {
    const chat = c as { remoteJid?: string }
    return chat.remoteJid && !chat.remoteJid.includes("@g.us") && !chat.remoteJid.includes("@broadcast")
  })
  console.log(`Chats individuais encontrados: ${individualChats.length}\n`)

  let contactsCreated = 0
  let messagesCreated = 0

  for (const chat of individualChats) {
    const { remoteJid: rawJid, pushName, profilePicUrl } = chat as {
      remoteJid: string
      pushName?: string
      profilePicUrl?: string
    }
    const jid = normalizeJid(rawJid)
    const displayName = pushName ?? jid.replace("@s.whatsapp.net", "")

    // Upsert contato
    const contact = await prisma.contact.upsert({
      where: { whatsappId: jid },
      create: { whatsappId: jid, name: displayName, profilePhotoUrl: profilePicUrl ?? null },
      update: { name: displayName, ...(profilePicUrl ? { profilePhotoUrl: profilePicUrl } : {}) },
    })

    const isNew = contact.createdAt.getTime() === contact.updatedAt.getTime()
    if (isNew) contactsCreated++

    // Buscar mensagens do chat
    const messages = await fetchMessages(rawJid, 50)

    for (const m of messages) {
      const msg = m as {
        key?: { fromMe?: boolean; id?: string }
        message?: Record<string, unknown>
        messageTimestamp?: number
        status?: string
      }
      if (!msg.key?.id) continue

      const body = extractText(msg.message ?? {})
      const direction = msg.key.fromMe ? MessageDirection.OUTBOUND : MessageDirection.INBOUND
      const status = msg.key.fromMe ? MessageStatus.SENT : MessageStatus.DELIVERED
      const createdAt = msg.messageTimestamp
        ? new Date(msg.messageTimestamp * 1000)
        : new Date()

      // Evitar duplicatas pelo whatsapp message ID via body+contact+createdAt
      const existing = await prisma.message.findFirst({
        where: { contactId: contact.id, body, createdAt },
      })
      if (existing) continue

      await prisma.message.create({
        data: { body, direction, status, contactId: contact.id, createdAt },
      })
      messagesCreated++
    }

    process.stdout.write(`  ✔ ${displayName} (${messages.length} msgs)\n`)
  }

  console.log(`\nSincronização concluída!`)
  console.log(`  Contatos novos : ${contactsCreated}`)
  console.log(`  Mensagens novas: ${messagesCreated}`)
}

main()
  .catch((err) => { console.error("Erro:", err); process.exit(1) })
  .finally(() => prisma.$disconnect())

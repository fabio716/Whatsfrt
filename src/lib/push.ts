// ═══════════════════════════════════════════════════════════════════════════
// Push notification real (Web Push + Service Worker) — funciona com o
// navegador fechado/minimizado, diferente de notifyDesktop (que só funciona
// com a aba aberta). Usa as subscriptions salvas em PushSubscription.
// ═══════════════════════════════════════════════════════════════════════════

import webpush from "web-push"
import { prisma } from "@/lib/prisma"

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || "mailto:contato@frtwhats.com"
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  tag?: string
  url?: string
}

// Envia push para um ou mais usuários. Falhas por subscription expirada
// (410/404) removem o registro do banco silenciosamente.
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!ensureConfigured() || userIds.length === 0) return

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  })
  if (subs.length === 0) return

  const json = JSON.stringify(payload)

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          json,
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        }
      }
    }),
  )
}

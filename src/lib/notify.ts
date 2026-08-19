// ═══════════════════════════════════════════════════════════════════════════
// Notificações do navegador (Notification API). Usadas em Chats e Mensagens
// pra avisar de mensagem nova quando a aba não está em foco.
//
// Não precisa de Service Worker/push server — funciona com a aba aberta
// (mesmo em outra aba/minimizada). Não notifica com a conversa em foco pra
// não distrair quem já está vendo a mensagem chegar na tela.
// ═══════════════════════════════════════════════════════════════════════════

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported"
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied"
  if (Notification.permission !== "default") return Notification.permission
  return Notification.requestPermission()
}

export function notifyDesktop(
  title: string,
  body: string,
  opts?: { tag?: string; onClick?: () => void; force?: boolean },
): void {
  if (!notificationsSupported()) return
  if (Notification.permission !== "granted") return
  // Aba em foco = usuário já está olhando a conversa, não precisa notificar
  // — EXCETO quando o chamador manda force:true porque a mensagem é de uma
  // conversa diferente da que está aberta (aba em foco não significa "vendo
  // esta conversa específica" — sem o force, mensagem de outro cliente
  // chegava muda enquanto o agente estava atendendo alguém mais).
  if (!opts?.force && typeof document !== "undefined" && document.hasFocus()) return

  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: opts?.tag,
  })
  n.onclick = () => {
    window.focus()
    opts?.onClick?.()
    n.close()
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Push notification real (Service Worker + Web Push) — ao contrário de
// notifyDesktop, funciona com o navegador fechado ou minimizado. Usa a mesma
// permissão do Notification API (Notification.permission).
// ═══════════════════════════════════════════════════════════════════════════

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    notificationsSupported()
  )
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

// Registra o service worker (idempotente) e cria/atualiza a subscription de
// push no servidor. Chamar depois que a permissão de notificação foi
// concedida — seguro de chamar de novo (upsert por endpoint).
export async function subscribeToPush(): Promise<void> {
  if (!pushSupported()) return
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey || Notification.permission !== "granted") return

  try {
    const registration = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      })
    }

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    })
  } catch {
    // Sem push real disponível (navegador sem suporte, HTTPS ausente, etc.)
    // — notifyDesktop (aba aberta) continua funcionando normalmente.
  }
}

// Remove a subscription de push (o usuário desativou notificações).
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js")
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    const endpoint = subscription.endpoint
    await subscription.unsubscribe()
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    })
  } catch {
    // Ignora — na pior hipótese a subscription expira sozinha no servidor.
  }
}

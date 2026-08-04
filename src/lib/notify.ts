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
  opts?: { tag?: string; onClick?: () => void },
): void {
  if (!notificationsSupported()) return
  if (Notification.permission !== "granted") return
  // Aba em foco = usuário já está olhando a conversa, não precisa notificar.
  if (typeof document !== "undefined" && document.hasFocus()) return

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

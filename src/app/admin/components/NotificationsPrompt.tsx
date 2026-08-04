"use client"

import { useEffect, useState } from "react"
import { notificationPermission, requestNotificationPermission, subscribeToPush } from "@/lib/notify"

const DISMISS_KEY = "whatsfrt:notifications-dismissed"

// Banner discreto pedindo permissão de notificação do navegador. Some
// sozinho depois de decidido (permitido/bloqueado) ou se o usuário dispensar.
export default function NotificationsPrompt() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const perm = notificationPermission()
    const dismissed = localStorage.getItem(DISMISS_KEY) === "1"
    setVisible(perm === "default" && !dismissed)
    // Permissão já concedida antes (outra sessão/dispositivo) — garante que
    // a subscription de push real existe pra este navegador também.
    if (perm === "granted") void subscribeToPush()
  }, [])

  if (!visible) return null

  const handleEnable = async () => {
    const perm = await requestNotificationPermission()
    if (perm === "granted") await subscribeToPush()
    setVisible(false)
  }
  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1")
    setVisible(false)
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-[12px]">
      <div className="flex items-center gap-2 text-emerald-800">
        <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        <span>Ativar notificações do navegador pra saber na hora quando chegar mensagem nova?</span>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => void handleEnable()}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
        >
          Ativar
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Agora não
        </button>
      </div>
    </div>
  )
}

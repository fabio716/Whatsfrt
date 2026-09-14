"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { notifyDesktop } from "@/lib/notify"

// ═══════════════════════════════════════════════════════════════════════════
// Notificador GLOBAL — vive na casca do painel, então funciona em QUALQUER
// tela (Contatos, Transmissão, Métricas...). Antes cada página abria sua
// própria escuta: quem estava fora de "Mensagens" não era avisado de mensagem
// interna, e quem estava fora de "Chats" não era avisado de cliente novo.
//
// Entrega: badge no menu (contadores), aviso na tela (toast clicável),
// som curto e notificação do navegador.
// ═══════════════════════════════════════════════════════════════════════════

export interface NotifyCounts {
  internal: number
  clients: number
}

// Preferências de aviso por pessoa (ficam no navegador dela). Cada chave
// controla badge + aviso na tela + som + notificação do navegador.
export interface NotifyPrefs {
  internal: boolean   // mensagens da equipe (chat interno)
  clients: boolean    // mensagens de clientes
  sound: boolean      // bip
}

export const NOTIFY_PREFS_KEY = "whatsfrt:notify-prefs"

// Admin não atende cliente (modo supervisão) — com 900+ contatos o aviso de
// cliente viraria ruído constante, então já começa desligado pra ele.
export function defaultPrefs(role: "ADMIN" | "AGENT"): NotifyPrefs {
  return { internal: true, clients: role !== "ADMIN", sound: true }
}

interface Toast {
  id: number
  kind: "internal" | "client"
  title: string
  body: string
  href: string
}

// Bip curto gerado na hora (sem arquivo de áudio). Silencioso se o navegador
// ainda não liberou áudio — nesse caso ficam o badge e o toast.
function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
    setTimeout(() => void ctx.close(), 500)
  } catch {
    // Som é enfeite — nunca deixa o aviso visual de fora por causa dele.
  }
}

export default function GlobalNotifier({
  onCounts,
  prefs,
}: Readonly<{ onCounts: (c: NotifyCounts) => void; prefs: NotifyPrefs }>) {
  const pathname = usePathname()
  const router = useRouter()
  const [toasts, setToasts] = useState<Toast[]>([])
  const internalRef = useRef(0)
  const clientsRef = useRef(0)
  const pathRef = useRef(pathname)
  useEffect(() => { pathRef.current = pathname }, [pathname])
  const prefsRef = useRef(prefs)
  useEffect(() => { prefsRef.current = prefs }, [prefs])

  const publish = useCallback(() => {
    onCounts({ internal: internalRef.current, clients: clientsRef.current })
  }, [onCounts])

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 9000)
  }, [])

  // Contagem real do chat interno (vem do banco) — no início e de minuto em
  // minuto, pra corrigir divergência se a aba ficou muito tempo aberta.
  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/counts")
      if (!res.ok) return
      const data = await res.json() as { internalUnread: number }
      // Na própria tela de Mensagens o badge não faz sentido (ela marca como
      // lido ao abrir a conversa) — evita badge "fantasma".
      internalRef.current = (!prefsRef.current.internal || pathRef.current.startsWith("/admin/mensagens"))
        ? 0
        : data.internalUnread
      publish()
    } catch {
      // rede instável — tenta de novo no próximo ciclo
    }
  }, [publish])

  useEffect(() => {
    void loadCounts()
    const t = setInterval(() => void loadCounts(), 60_000)
    return () => clearInterval(t)
  }, [loadCounts])

  // Desligou o aviso? Some o contador na hora. Ligou o da equipe? Recarrega.
  useEffect(() => {
    if (!prefs.internal) { internalRef.current = 0; publish() } else { void loadCounts() }
    if (!prefs.clients) { clientsRef.current = 0; publish() }
  }, [prefs.internal, prefs.clients, publish, loadCounts])

  // Ao entrar na tela correspondente, zera o contador daquele tipo.
  useEffect(() => {
    if (pathname.startsWith("/admin/mensagens")) { internalRef.current = 0; publish() }
    if (pathname.startsWith("/admin/chats")) { clientsRef.current = 0; publish() }
  }, [pathname, publish])

  // SSE global: um canal só, sempre aberto enquanto o painel estiver aberto.
  useEffect(() => {
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let alive = true

    const connect = () => {
      if (!alive) return
      source = new EventSource("/api/sse")

      source.onmessage = (e) => {
        let p: { type?: string; data?: Record<string, unknown> }
        try { p = JSON.parse(e.data as string) } catch { return }
        if (!p.type || !p.data) return

        // ── Mensagem interna da equipe ──
        if (p.type === "internal_message") {
          if (!prefsRef.current.internal) return // avisado desligado por ela
          const d = p.data as { conversationId?: string; senderName?: string; body?: string; mediaType?: string | null }
          if (pathRef.current.startsWith("/admin/mensagens")) return // a própria tela cuida
          internalRef.current += 1
          publish()
          const quem = d.senderName || "Equipe"
          const texto = d.mediaType ? "📎 Anexo" : (d.body || "Nova mensagem")
          if (prefsRef.current.sound) beep()
          pushToast({ kind: "internal", title: `💬 ${quem}`, body: texto, href: "/admin/mensagens" })
          notifyDesktop(`${quem} (equipe)`, texto, { tag: "interno-global", force: true, onClick: () => router.push("/admin/mensagens") })
          return
        }

        // ── Mensagem nova de cliente ──
        if (p.type === "new_message") {
          if (!prefsRef.current.clients) return // aviso de cliente desligado
          const d = p.data as { direction?: string; body?: string; mediaType?: string | null; contact?: { id?: string; name?: string } }
          if (d.direction !== "INBOUND") return // só o que o cliente manda
          if (pathRef.current.startsWith("/admin/chats")) return // a própria tela cuida
          clientsRef.current += 1
          publish()
          const quem = d.contact?.name || "Cliente"
          const texto = d.mediaType ? "📎 Mídia" : (d.body || "Nova mensagem")
          if (prefsRef.current.sound) beep()
          pushToast({
            kind: "client",
            title: `🟢 ${quem}`,
            body: texto,
            href: d.contact?.id ? `/admin/chats?contact=${d.contact.id}` : "/admin/chats",
          })
          notifyDesktop(quem, texto, { tag: `cliente-${d.contact?.id ?? "novo"}`, force: true, onClick: () => router.push("/admin/chats") })
        }
      }

      source.onerror = () => {
        source?.close()
        if (!alive) return
        retry = setTimeout(connect, 4000)
      }
    }

    connect()
    return () => {
      alive = false
      if (retry) clearTimeout(retry)
      source?.close()
    }
  }, [publish, pushToast, router])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[300px] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            setToasts((prev) => prev.filter((x) => x.id !== t.id))
            router.push(t.href)
          }}
          className={`pointer-events-auto w-full rounded-xl border-l-4 bg-white px-3.5 py-2.5 text-left shadow-lg shadow-zinc-300/40 transition-transform hover:scale-[1.02] ${
            t.kind === "internal" ? "border-violet-500" : "border-emerald-500"
          }`}
        >
          <p className="truncate text-[12.5px] font-bold text-zinc-800">{t.title}</p>
          <p className="line-clamp-2 text-[12px] text-zinc-500">{t.body}</p>
          <p className="mt-0.5 text-[10px] font-medium text-zinc-400">
            Clique para abrir {t.kind === "internal" ? "Mensagens" : "o chat"}
          </p>
        </button>
      ))}
    </div>
  )
}

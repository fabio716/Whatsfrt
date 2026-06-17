"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { ChatStatus, ContactData, MessageData } from "../types"
import type { SSEPayload } from "@/lib/sse-emitter"

const CHAT_STATUS_CONFIG: Record<ChatStatus, { label: string; cls: string }> = {
  IDLE:          { label: "",             cls: "" },
  IN_URA:        { label: "URA",          cls: "bg-blue-50 text-blue-600" },
  WAITING_AGENT: { label: "Aguardando",  cls: "bg-amber-50 text-amber-600" },
  IN_SERVICE:    { label: "Em atendimento", cls: "bg-emerald-50 text-emerald-700" },
  AWAITING_RATING: { label: "Aguardando nota", cls: "bg-purple-50 text-purple-700" },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-600",
  "bg-amber-500",  "bg-rose-500",  "bg-indigo-500",
]

function avatarColor(name: string): string {
  const hash = [...name].reduce((acc, ch) => acc + (ch.codePointAt(0) ?? 0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Hoje"
  if (d.toDateString() === yesterday.toDateString()) return "Ontem"
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

interface MessageGroup {
  dateLabel: string
  messages: MessageData[]
}

function groupByDate(messages: MessageData[]): MessageGroup[] {
  const map = new Map<string, MessageData[]>()
  for (const m of messages) {
    const key = new Date(m.createdAt).toDateString()
    const arr = map.get(key) ?? []
    arr.push(m)
    map.set(key, arr)
  }
  return [...map.entries()].map(([key, msgs]) => ({
    dateLabel: formatDateLabel(new Date(key).toISOString()),
    messages: msgs,
  }))
}

function formatPreview(contact: ContactData): string {
  const last = contact.messages.at(-1)
  if (!last) return "Sem mensagens"
  const prefix = last.direction === "OUTBOUND" ? "Você: " : ""
  if (last.mediaType && !last.body) {
    if (last.mediaType.startsWith("image/")) return `${prefix}📷 Foto`
    if (last.mediaType.startsWith("video/")) return `${prefix}🎥 Vídeo`
    if (last.mediaType.startsWith("audio/")) return `${prefix}🎵 Áudio`
    return `${prefix}📎 Arquivo`
  }
  const text = last.body.length > 40 ? last.body.slice(0, 40) + "…" : last.body
  return `${prefix}${text}`
}

function lastMessageTime(contact: ContactData): string {
  const last = contact.messages.at(-1)
  return last ? formatTime(last.createdAt) : ""
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({
  name,
  photoUrl,
  size = "md",
}: Readonly<{
  name: string
  photoUrl: string | null
  size?: "sm" | "md" | "lg"
}>) {
  const [error, setError] = useState(false)
  const SIZE_MAP = { sm: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base", md: "h-9 w-9 text-xs" } as const
  const sizeClass = SIZE_MAP[size]

  if (photoUrl && !error) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sizeClass} flex-shrink-0 rounded-full object-cover`}
        onError={() => setError(true)}
      />
    )
  }

  return (
    <div
      className={`${sizeClass} ${avatarColor(name)} flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white`}
    >
      {initials(name)}
    </div>
  )
}

function MessageStatusIcon({ status }: Readonly<{ status: MessageData["status"] }>) {
  if (status === "PENDING") {
    return (
      <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
        <circle cx="12" cy="12" r="9" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === "FAILED") {
    return (
      <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    )
  }

  const isRead = status === "READ"
  const color = isRead ? "text-blue-500" : "text-zinc-400"
  const double = status === "DELIVERED" || status === "READ"

  return (
    <svg className={`h-3.5 w-${double ? "5" : "3.5"} ${color}`} fill="currentColor" viewBox="0 0 20 12">
      {double ? (
        <>
          <path d="M1 6l4 4L13 1" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 6l4 4L18 1" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path d="M1 6l4 4L13 1" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function MediaContent({ mediaUrl, mediaType, body }: Readonly<{ mediaUrl: string; mediaType: string; body: string }>) {
  if (mediaType.startsWith("image/")) {
    return (
      <div className="space-y-1">
        <img
          src={mediaUrl}
          alt={body || "imagem"}
          className="max-h-60 w-full max-w-xs rounded-xl object-cover"
          loading="lazy"
        />
        {body && <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{body}</p>}
      </div>
    )
  }
  if (mediaType.startsWith("video/")) {
    return (
      <div className="space-y-1">
        <video src={mediaUrl} controls className="max-h-48 max-w-xs rounded-xl">
          <track kind="captions" />
        </video>
        {body && <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{body}</p>}
      </div>
    )
  }
  if (mediaType.startsWith("audio/")) {
    return (
      <audio src={mediaUrl} controls className="w-full max-w-xs">
        <track kind="captions" />
      </audio>
    )
  }
  const fileName = mediaUrl.split("/").pop() ?? "arquivo"
  return (
    <a
      href={mediaUrl}
      download
      className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 flex-shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate max-w-[160px]">{fileName}</span>
      <svg viewBox="0 0 24 24" className="ml-auto h-4 w-4 flex-shrink-0 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  )
}

function EmptyChat() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-zinc-100">
        <svg viewBox="0 0 24 24" className="h-10 w-10 fill-zinc-300" xmlns="http://www.w3.org/2000/svg">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-700">Nenhuma conversa selecionada</p>
        <p className="text-xs text-zinc-400">Escolha um contato na barra lateral</p>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardClient({ contacts: initialContacts }: Readonly<{ contacts: ContactData[] }>) {
  const [contacts, setContacts] = useState<ContactData[]>(initialContacts)
  const [activeId, setActiveId] = useState<string | null>(initialContacts[0]?.id ?? null)
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [sseConnected, setSseConnected] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  const activeContact = contacts.find((c) => c.id === activeId) ?? null
  const messageGroups = activeContact ? groupByDate(activeContact.messages) : []
  const activeMessageCount = activeContact?.messages.length ?? 0

  // Scroll to bottom on contact switch (instant) or new message (smooth)
  const prevActiveIdRef = useRef<string | null>(null)
  useEffect(() => {
    const behavior = prevActiveIdRef.current === activeId ? "smooth" : "auto"
    prevActiveIdRef.current = activeId
    messagesEndRef.current?.scrollIntoView({ behavior })
  }, [activeId, activeMessageCount])

  // ─── SSE — real-time inbound messages with auto-reconnect ──────────────────
  useEffect(() => {
    let source: EventSource
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let active = true

    const onNewMessage = (payload: SSEPayload) => {
      if (payload.type !== "new_message") return
      const { contact, ...msg } = payload.data
      const newMsg: MessageData = {
        id: msg.id, body: msg.body, direction: msg.direction,
        status: msg.status, createdAt: msg.createdAt, agentId: msg.agentId,
        mediaUrl: msg.mediaUrl, mediaType: msg.mediaType,
      }
      setContacts((prev) => {
        const exists = prev.some((c) => c.id === contact.id)
        const updated = exists
          ? prev.map((c) =>
              c.id === contact.id
                ? { ...c, messages: c.messages.some((m) => m.id === newMsg.id) ? c.messages : [...c.messages, newMsg] }
                : c
            )
          : [...prev, { ...contact, messages: [newMsg] }]
        const target = updated.find((c) => c.id === contact.id)
        return target ? [target, ...updated.filter((c) => c.id !== contact.id)] : updated
      })
    }

    const onMessageUpdate = (payload: SSEPayload) => {
      if (payload.type !== "message_update") return
      const { id, status, contactId } = payload.data
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contactId
            ? { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, status } : m)) }
            : c
        )
      )
    }

    const connect = () => {
      if (!active) return
      source = new EventSource("/api/sse")
      source.onopen = () => setSseConnected(true)
      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as SSEPayload
          onNewMessage(payload)
          onMessageUpdate(payload)
        } catch { /* ignore malformed SSE events */ }
      }
      source.onerror = () => {
        setSseConnected(false)
        source.close()
        if (active) retryTimer = setTimeout(connect, 3_000)
      }
    }

    connect()
    return () => {
      active = false
      if (retryTimer) clearTimeout(retryTimer)
      source?.close()
    }
  }, [])

  // ─── Send media file ─────────────────────────────────────────────────────────
  const handleSendMedia = useCallback(async (file: File) => {
    if (!activeId || isUploading) return
    const tempId = `temp-media-${Date.now()}`
    const localUrl = URL.createObjectURL(file)
    const tempMsg: MessageData = {
      id: tempId, body: "", direction: "OUTBOUND",
      status: "PENDING", createdAt: new Date().toISOString(), agentId: null,
      mediaUrl: localUrl, mediaType: file.type,
    }
    setContacts((prev) => {
      const updated = prev.map((c) => c.id === activeId ? { ...c, messages: [...c.messages, tempMsg] } : c)
      const target = updated.find((c) => c.id === activeId)
      return target ? [target, ...updated.filter((c) => c.id !== activeId)] : updated
    })
    setIsUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("contactId", activeId)
      const res = await fetch("/api/messages/send-media", { method: "POST", body: fd })
      const data = (await res.json()) as { id: string; status: MessageData["status"]; mediaUrl: string }
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c
          const hasReal = c.messages.some((m) => m.id === data.id)
          return {
            ...c,
            messages: hasReal
              ? c.messages.filter((m) => m.id !== tempId)
              : c.messages.map((m) =>
                  m.id === tempId ? { ...m, id: data.id, status: data.status, mediaUrl: data.mediaUrl } : m
                ),
          }
        })
      )
    } catch {
      setContacts((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, messages: c.messages.map((m) => m.id === tempId ? { ...m, status: "FAILED" as const } : m) }
            : c
        )
      )
    } finally {
      setIsUploading(false)
      URL.revokeObjectURL(localUrl)
    }
  }, [activeId, isUploading])

  // ─── Send message with optimistic UI ───────────────────────────────────────
  const handleSend = async () => {
    if (!inputValue.trim() || !activeId || isSending) return

    const text = inputValue.trim()
    const tempId = `temp-${Date.now()}`
    const tempMsg: MessageData = {
      id: tempId, body: text, direction: "OUTBOUND",
      status: "PENDING", createdAt: new Date().toISOString(), agentId: null,
    }

    setInputValue("")

    // Optimistic: add message + bubble contact to top of list
    setContacts((prev) => {
      const updated = prev.map((c) =>
        c.id === activeId ? { ...c, messages: [...c.messages, tempMsg] } : c
      )
      const target = updated.find((c) => c.id === activeId)
      return target ? [target, ...updated.filter((c) => c.id !== activeId)] : updated
    })

    setIsSending(true)
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: activeId, text }),
      })
      const data = (await res.json()) as { id: string; status: MessageData["status"] }
      // Replace temp message with persisted one (or drop it if SSE already delivered the real one)
      setContacts((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c
          const hasReal = c.messages.some((m) => m.id === data.id)
          return {
            ...c,
            messages: hasReal
              ? c.messages.filter((m) => m.id !== tempId)
              : c.messages.map((m) => (m.id === tempId ? { ...m, id: data.id, status: data.status } : m)),
          }
        })
      )
    } catch {
      // Mark as FAILED on network error
      setContacts((prev) =>
        prev.map((c) =>
          c.id === activeId
            ? { ...c, messages: c.messages.map((m) => (m.id === tempId ? { ...m, status: "FAILED" as const } : m)) }
            : c
        )
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-zinc-50 font-sans">

      {/* ══════════════════ SIDEBAR ══════════════════ */}
      <aside className="flex w-[30%] flex-shrink-0 flex-col overflow-hidden border-r border-zinc-100 bg-white">

        {/* Sidebar header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Conversas</h1>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {contacts.length} {contacts.length === 1 ? "contato" : "contatos"} · ao vivo
            </p>
          </div>
          <div className={`flex h-2 w-2 rounded-full ${sseConnected ? "bg-emerald-500" : "bg-zinc-300"}`}>
            {sseConnected && <span className="inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
          </div>
        </div>

        {/* Contact list */}
        <nav className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <p className="text-sm text-zinc-400">Nenhum contato ainda.</p>
              <p className="text-xs text-zinc-300">As conversas aparecerão aqui após o primeiro webhook.</p>
            </div>
          )}

          {contacts.map((contact) => {
            const isActive = contact.id === activeId
            return (
              <button
                key={contact.id}
                onClick={() => setActiveId(contact.id)}
                className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors ${
                  isActive
                    ? "border-l-[3px] border-[#25D366] bg-[#f0fdf4]"
                    : "border-l-[3px] border-transparent hover:bg-zinc-50"
                }`}
              >
                <Avatar name={contact.name} photoUrl={contact.profilePhotoUrl} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-[13px] font-semibold text-zinc-800">
                      {contact.name}
                    </span>
                    <span className="flex-shrink-0 text-[10px] text-zinc-400">
                      {lastMessageTime(contact)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="truncate text-[12px] text-zinc-400">{formatPreview(contact)}</p>
                    {contact.chatStatus !== "IDLE" && (() => {
                      const cfg = CHAT_STATUS_CONFIG[contact.chatStatus]
                      return (
                        <span className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cfg.cls}`}>
                          {cfg.label}
                        </span>
                      )
                    })()}
                  </div>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="border-t border-zinc-100 bg-zinc-50/60 px-5 py-2.5">
          <span className="text-[10px] text-zinc-300 select-none">Minhas Conversas</span>
        </div>
      </aside>

      {/* ══════════════════ CHAT AREA ══════════════════ */}
      <main className="flex flex-1 flex-col overflow-hidden">

        {activeContact ? (
          <>
            {/* Chat header */}
            <header className="flex items-center gap-4 border-b border-zinc-100 bg-white px-6 py-3.5 shadow-sm shadow-zinc-100/60">
              <Avatar name={activeContact.name} photoUrl={activeContact.profilePhotoUrl} size="lg" />
              <div className="flex-1 min-w-0">
                <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900 truncate">
                  {activeContact.name}
                </h2>
                <p className="text-xs text-zinc-400 truncate">
                  {activeContact.whatsappId.replace("@s.whatsapp.net", "").replace("@g.us", " (grupo)")}
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-zinc-100 bg-zinc-50 px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium text-zinc-500">WhatsApp</span>
              </div>
            </header>

            {/* Messages area */}
            <section
              className="flex-1 overflow-y-auto px-6 py-5"
              style={{ backgroundImage: "radial-gradient(circle, #e5e7eb 1px, transparent 1px)", backgroundSize: "24px 24px", backgroundColor: "#f9fafb" }}
            >
              {activeContact.messages.length === 0 && (
                <div className="flex h-full items-center justify-center">
                  <p className="text-sm text-zinc-400">Sem mensagens nesta conversa.</p>
                </div>
              )}

              {messageGroups.map((group) => (
                <div key={group.dateLabel} className="space-y-2">
                  {/* Date separator */}
                  <div className="flex items-center gap-3 py-3">
                    <div className="h-px flex-1 bg-zinc-200/70" />
                    <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-400 shadow-sm">
                      {group.dateLabel}
                    </span>
                    <div className="h-px flex-1 bg-zinc-200/70" />
                  </div>

                  {/* Bubbles */}
                  {group.messages.map((msg) => {
                    const isOut = msg.direction === "OUTBOUND"
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOut ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`relative max-w-[68%] rounded-2xl px-3 py-2.5 shadow-sm ${
                            isOut
                              ? "rounded-tr-sm bg-[#dcf8c6] text-zinc-800"
                              : "rounded-tl-sm bg-white text-zinc-800 border border-zinc-100"
                          }`}
                        >
                          {msg.mediaUrl && msg.mediaType ? (
                            <MediaContent mediaUrl={msg.mediaUrl} mediaType={msg.mediaType} body={msg.body} />
                          ) : (
                            <p translate="no" className="whitespace-pre-wrap break-words text-[13px] leading-relaxed px-1">
                              {msg.body}
                            </p>
                          )}
                          <div className={`mt-1 flex items-center gap-1 px-1 ${isOut ? "justify-end" : "justify-start"}`}>
                            <span className="text-[10px] text-zinc-400">{formatTime(msg.createdAt)}</span>
                            {isOut && <MessageStatusIcon status={msg.status} />}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              <div ref={messagesEndRef} />
            </section>

            {/* Input footer */}
            <footer className="flex items-center gap-2 border-t border-zinc-100 bg-white px-4 py-3">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleSendMedia(f)
                  e.target.value = ""
                }}
              />
              {/* Attachment button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                title="Enviar arquivo"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-40"
              >
                <PaperclipIcon />
              </button>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void handleSend() }}
                placeholder={isUploading ? "Enviando arquivo..." : "Digite uma mensagem..."}
                disabled={isUploading}
                className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none transition-colors focus:border-zinc-300 focus:bg-white disabled:opacity-60"
              />
              <button
                onClick={() => void handleSend()}
                disabled={!inputValue.trim() || isSending || isUploading}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md shadow-emerald-200 transition-all hover:bg-[#1db954] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <SendIcon />
              </button>
            </footer>
          </>
        ) : (
          <EmptyChat />
        )}
      </main>
    </div>
  )
}

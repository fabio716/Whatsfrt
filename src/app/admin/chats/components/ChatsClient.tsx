"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import type { SSEPayload } from "@/lib/sse-emitter"
import type { ContactData, MessageData } from "@/app/admin/dashboard/types"

type Agent = { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function groupByDate(messages: MessageData[]) {
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

function StatusBadge({ status }: Readonly<{ status: ContactData["chatStatus"] }>) {
  const cfg: Record<string, { label: string; cls: string }> = {
    IDLE:          { label: "Inativo",         cls: "bg-zinc-100 text-zinc-400" },
    IN_URA:        { label: "URA",             cls: "bg-blue-50 text-blue-600" },
    WAITING_AGENT: { label: "Aguardando",      cls: "bg-amber-50 text-amber-600" },
    IN_SERVICE:    { label: "Em atendimento",  cls: "bg-emerald-50 text-emerald-700" },
  }
  const { label, cls } = cfg[status] ?? cfg.IDLE
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cls}`}>{label}</span>
}

function MediaBubble({ mediaUrl, mediaType, body }: Readonly<{ mediaUrl: string; mediaType: string; body: string }>) {
  if (mediaType.startsWith("image/")) {
    return (
      <div className="space-y-1">
        <img src={mediaUrl} alt={body || "imagem"} className="max-h-48 max-w-xs rounded-xl object-cover" loading="lazy" />
        {body && <p className="text-[13px] leading-relaxed">{body}</p>}
      </div>
    )
  }
  if (mediaType.startsWith("video/")) {
    return (
      <div className="space-y-1">
        <video src={mediaUrl} controls className="max-h-40 max-w-xs rounded-xl">
          <track kind="captions" />
        </video>
        {body && <p className="text-[13px] leading-relaxed">{body}</p>}
      </div>
    )
  }
  if (mediaType.startsWith("audio/")) {
    return (
      <audio src={mediaUrl} controls className="max-w-xs">
        <track kind="captions" />
      </audio>
    )
  }
  return (
    <a href={mediaUrl} download className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-100">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {mediaUrl.split("/").pop()}
    </a>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatsClient({
  contacts: initial,
  agents,
  currentUserId,
}: Readonly<{
  contacts: ContactData[]
  agents: Agent[]
  currentUserId: string
}>) {
  const [contacts, setContacts] = useState<ContactData[]>(initial)
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null)
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [taking, setTaking] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevActiveRef   = useRef<string | null>(null)

  const activeContact = contacts.find((c) => c.id === activeId) ?? null
  const isOwner = activeContact?.assignedUserId === currentUserId

  const filteredContacts = agentFilter === "all"
    ? contacts
    : agentFilter === "unassigned"
      ? contacts.filter((c) => !c.assignedUserId)
      : contacts.filter((c) => c.assignedUserId === agentFilter)

  // Scroll
  useEffect(() => {
    const behavior = prevActiveRef.current === activeId ? "smooth" : "auto"
    prevActiveRef.current = activeId
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" })
  }, [activeId, activeContact?.messages.length])

  // SSE
  useEffect(() => {
    let source: EventSource
    let retry: ReturnType<typeof setTimeout> | null = null
    let alive = true

    const connect = () => {
      if (!alive) return
      source = new EventSource("/api/sse")
      source.onmessage = (e) => {
        const p = JSON.parse(e.data as string) as SSEPayload
        if (p.type !== "new_message") return
        const { contact, ...msg } = p.data
        const newMsg: MessageData = {
          id: msg.id, body: msg.body, direction: msg.direction,
          status: msg.status, createdAt: msg.createdAt, agentId: msg.agentId,
          mediaUrl: msg.mediaUrl, mediaType: msg.mediaType,
        }
        setContacts((prev) => {
          const exists = prev.some((c) => c.id === contact.id)
          const updated = exists
            ? prev.map((c) => c.id === contact.id ? { ...c, ...contact, messages: [...c.messages, newMsg] } : c)
            : [...prev, { ...contact, messages: [newMsg] }]
          const target = updated.find((c) => c.id === contact.id)
          return target ? [target, ...updated.filter((c) => c.id !== contact.id)] : updated
        })
      }
      source.onerror = () => {
        source.close()
        if (alive) retry = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => { alive = false; if (retry) clearTimeout(retry); source?.close() }
  }, [])

  // Take over contact
  const handleTakeOver = useCallback(async () => {
    if (!activeId || taking) return
    setTaking(true)
    try {
      const res = await fetch(`/api/admin/contacts/${activeId}/assign`, { method: "POST" })
      if (res.ok) {
        const data = (await res.json()) as { assignedUserId: string; chatStatus: string }
        setContacts((prev) => prev.map((c) =>
          c.id === activeId ? { ...c, assignedUserId: data.assignedUserId, chatStatus: data.chatStatus as ContactData["chatStatus"] } : c
        ))
      }
    } finally {
      setTaking(false)
    }
  }, [activeId, taking])

  // Send message (only when owner)
  const handleSend = async () => {
    if (!inputValue.trim() || !activeId || isSending || !isOwner) return
    const text = inputValue.trim()
    setInputValue("")
    setIsSending(true)
    try {
      await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: activeId, text }),
      })
    } finally {
      setIsSending(false)
    }
  }

  const messageGroups = activeContact ? groupByDate(activeContact.messages) : []

  return (
    <div className="flex h-full overflow-hidden bg-zinc-50 font-sans">

      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="flex w-72 flex-shrink-0 flex-col overflow-hidden border-r border-zinc-100 bg-white">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h1 className="text-[14px] font-semibold text-zinc-900">Chats Globais</h1>
          <p className="text-[11px] text-zinc-400">{contacts.length} contatos</p>
        </div>

        {/* Agent filter */}
        <div className="border-b border-zinc-100 px-4 py-2.5">
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-zinc-300"
          >
            <option value="all">Todos os agentes</option>
            <option value="unassigned">Sem agente</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Contact list */}
        <nav className="flex-1 overflow-y-auto">
          {filteredContacts.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-zinc-400">Nenhum contato</p>
          )}
          {filteredContacts.map((c) => {
            const last = c.messages.at(-1)
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-start gap-3 border-b border-zinc-50 px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${activeId === c.id ? "bg-zinc-50" : ""}`}
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[13px] font-semibold text-zinc-600">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium text-zinc-800 truncate">{c.name}</span>
                    <StatusBadge status={c.chatStatus} />
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                    {last ? (last.mediaType && !last.body ? "📎 Mídia" : last.body.slice(0, 40)) : "Sem mensagens"}
                  </p>
                </div>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ─── Chat area ───────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeContact ? (
          <>
            {/* Header */}
            <header className="flex items-center justify-between border-b border-zinc-100 bg-white px-6 py-3.5 shadow-sm shadow-zinc-100/60">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-600">
                  {activeContact.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-zinc-900">{activeContact.name}</p>
                  <p className="text-[11px] text-zinc-400">
                    {activeContact.whatsappId.replace("@s.whatsapp.net", "")}
                    {activeContact.assignedUserId && (
                      <span className="ml-1.5 text-zinc-300">·</span>
                    )}
                    {activeContact.assignedUserId && (
                      <span className="ml-1.5 text-emerald-600">
                        {agents.find((a) => a.id === activeContact.assignedUserId)?.name ?? "Agente"}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={activeContact.chatStatus} />
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => void handleTakeOver()}
                    disabled={taking}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {taking ? "Assumindo..." : "Assumir Atendimento"}
                  </button>
                )}
              </div>
            </header>

            {/* Messages */}
            <section className="flex-1 overflow-y-auto px-6 py-4 space-y-1">
              {messageGroups.map((group) => (
                <div key={group.dateLabel}>
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-100" />
                    <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-300">{group.dateLabel}</span>
                    <div className="h-px flex-1 bg-zinc-100" />
                  </div>
                  {group.messages.map((msg) => {
                    const isOut = msg.direction === "OUTBOUND"
                    return (
                      <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"} mb-1`}>
                        <div className={`relative max-w-[68%] rounded-2xl px-3 py-2.5 shadow-sm ${isOut ? "rounded-tr-sm bg-[#dcf8c6] text-zinc-800" : "rounded-tl-sm border border-zinc-100 bg-white text-zinc-800"}`}>
                          {msg.mediaUrl && msg.mediaType
                            ? <MediaBubble mediaUrl={msg.mediaUrl} mediaType={msg.mediaType} body={msg.body} />
                            : <p className="whitespace-pre-wrap break-words px-1 text-[13px] leading-relaxed">{msg.body}</p>
                          }
                          <div className={`mt-1 flex items-center gap-1 px-1 ${isOut ? "justify-end" : "justify-start"}`}>
                            <span className="text-[10px] text-zinc-400">{formatTime(msg.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </section>

            {/* Read-only footer / owned footer */}
            <footer className="flex items-center gap-2 border-t border-zinc-100 bg-white px-4 py-3">
              {isOwner ? (
                <>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void handleSend() }}
                    placeholder="Digite uma mensagem..."
                    className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-zinc-300 focus:bg-white"
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={!inputValue.trim() || isSending}
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-md transition-all hover:bg-[#1db954] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </>
              ) : (
                <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-300" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-[12px] text-zinc-400">Modo auditoria · Clique em <strong>Assumir Atendimento</strong> para enviar</span>
                </div>
              )}
            </footer>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-zinc-400 text-sm">
            Selecione um contato
          </div>
        )}
      </main>
    </div>
  )
}

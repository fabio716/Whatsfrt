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
    AWAITING_RATING: { label: "Aguardando nota", cls: "bg-purple-50 text-purple-700" },
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

// ─── Status icon (WhatsApp-style: relógio / ✓ / ✓✓ / ✓✓ azul / ⚠️) ──────────
function MessageStatusIcon({ status }: Readonly<{ status: MessageData["status"] }>) {
  if (status === "PENDING") {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5V8l2 1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (status === "FAILED") {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 text-red-500" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="8" cy="8" r="6.5" />
        <path d="M8 4.5v4M8 11h.01" strokeLinecap="round" />
      </svg>
    )
  }
  // SENT / DELIVERED / READ — ticks acumulam, READ fica azul
  const color = status === "READ" ? "text-sky-500" : "text-zinc-400"
  return (
    <svg viewBox="0 0 18 12" className={`h-3 w-3.5 ${color}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6.5l3 3 6-6" />
      {(status === "DELIVERED" || status === "READ") && <path d="M6 9.5l3-3 6-6" />}
    </svg>
  )
}

// ─── Emoji picker (inline, sem dependência externa) ─────────────────────────
const EMOJI_GROUPS = {
  "😀 Emoções": ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😋","😛","😜","🤪","😝","🤗","🤔","😐","😑","😶","🙄","😏","😒","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬"],
  "👍 Gestos": ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🖐️","🖖","👋","🤚","🤝","🙏","👏","🙌","💪","🤲"],
  "❤️ Coração": ["❤️","🧡","💛","💚","💙","💜","🤎","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟"],
  "✅ Símbolos": ["✅","❌","⚠️","🚨","🔥","💯","🎉","🎊","🌟","⭐","✨","💎","⏰","📌","📍","🔔","🔕","📎","📞","📱","💰","💵","💳","🎁","🛒","📦","🚚","🏦"],
}

function EmojiPicker({ onPick, onClose }: Readonly<{ onPick: (emoji: string) => void; onClose: () => void }>) {
  return (
    <div className="absolute bottom-14 left-2 z-50 max-h-64 w-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Emojis</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700" title="Fechar">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {Object.entries(EMOJI_GROUPS).map(([group, emojis]) => (
        <div key={group} className="mb-2">
          <p className="mb-0.5 px-1 text-[10px] font-medium text-zinc-400">{group}</p>
          <div className="grid grid-cols-8 gap-0.5">
            {emojis.map((e) => (
              <button
                key={e}
                onClick={() => onPick(e)}
                className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-zinc-100"
                type="button"
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ChatsClient({
  contacts: initial,
  agents,
  currentUserId,
  isAgent = false,
}: Readonly<{
  contacts: ContactData[]
  agents: Agent[]
  currentUserId: string
  isAgent?: boolean
}>) {
  const [contacts, setContacts] = useState<ContactData[]>(initial)
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null)
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [taking, setTaking] = useState(false)
  const [ending, setEnding] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showEmojis, setShowEmojis] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
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
        let p: SSEPayload
        try { p = JSON.parse(e.data as string) as SSEPayload } catch { return }

        if (p.type === "new_message") {
          const { contact, ...msg } = p.data
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
                    ? { ...c, ...contact, messages: c.messages.some((m) => m.id === newMsg.id) ? c.messages : [...c.messages, newMsg] }
                    : c
                )
              : [...prev, { ...contact, messages: [newMsg] }]
            const target = updated.find((c) => c.id === contact.id)
            return target ? [target, ...updated.filter((c) => c.id !== contact.id)] : updated
          })
          return
        }

        if (p.type === "message_update") {
          // Atualiza status da mensagem (SENT/DELIVERED/READ/FAILED). O reaper
          // emite FAILED para mensagens travadas em PENDING > 10min.
          setContacts((prev) => prev.map((c) =>
            c.id === p.data.contactId
              ? { ...c, messages: c.messages.map((m) => m.id === p.data.id ? { ...m, status: p.data.status } : m) }
              : c
          ))
          return
        }
        // evolution_state é consumido pelo EvolutionStatusBanner.
      }
      source.onerror = () => {
        source.close()
        if (alive) retry = setTimeout(connect, 3000)
      }
    }
    connect()
    return () => { alive = false; if (retry) clearTimeout(retry); source?.close() }
  }, [])

  // Delete contact
  const handleDelete = useCallback(async () => {
    if (!activeId || isDeleting) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/contacts/${activeId}`, { method: "DELETE" })
      if (res.ok) {
        setContacts((prev) => prev.filter((c) => c.id !== activeId))
        setActiveId(null)
      }
    } finally {
      setIsDeleting(false)
      setConfirmDelete(false)
    }
  }, [activeId, isDeleting])

  // Encerrar atendimento e pedir nota ao cliente
  const handleEndService = useCallback(async () => {
    if (!activeId || ending) return
    if (!confirm("Encerrar atendimento e pedir nota ao cliente?")) return
    setEnding(true)
    try {
      const res = await fetch("/api/services/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: activeId }),
      })
      if (res.ok) {
        // O contato sai da lista (já não está mais IN_SERVICE) — UI atualiza via SSE
        setActiveId(null)
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(data.error ?? "Não foi possível encerrar.")
      }
    } finally {
      setEnding(false)
    }
  }, [activeId, ending])

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
  // Upload e envio de mídia (foto/vídeo/documento)
  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = "" // permite escolher mesmo arquivo de novo
    if (!file || !activeId || isUploading || !isOwner) return

    // Limites por tipo (mesmos do WhatsApp). Documento aceita até 100 MB.
    const maxByCategory =
      file.type.startsWith("image/")    ? 16 * 1024 * 1024   // imagem 16 MB (folga)
    : file.type.startsWith("video/")    ? 16 * 1024 * 1024   // vídeo 16 MB
    : file.type.startsWith("audio/")    ? 16 * 1024 * 1024   // áudio 16 MB
    : /* documento */                     100 * 1024 * 1024  // documento 100 MB

    if (file.size > maxByCategory) {
      const limitMB = Math.round(maxByCategory / 1024 / 1024)
      const kind = file.type.startsWith("image/") ? "imagem"
                 : file.type.startsWith("video/") ? "vídeo"
                 : file.type.startsWith("audio/") ? "áudio"
                 : "documento"
      alert(`Arquivo muito grande. Limite WhatsApp para ${kind}: ${limitMB} MB.`)
      return
    }

    setIsUploading(true)
    const idempotencyKey = `${activeId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const formData = new FormData()
    formData.append("file", file)
    formData.append("contactId", activeId)
    formData.append("caption", inputValue.trim())

    try {
      const res = await fetch("/api/messages/send-media", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: formData,
      })
      if (res.ok) {
        setInputValue("") // limpa legenda se enviou
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(`Falha ao enviar arquivo: ${data.error ?? res.status}`)
      }
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsUploading(false)
    }
  }, [activeId, inputValue, isOwner, isUploading])

  const handleSend = async () => {
    if (!inputValue.trim() || !activeId || isSending || !isOwner) return
    const text = inputValue.trim()
    setInputValue("")
    setIsSending(true)
    // Idempotency-Key: garante que duplo-clique / retry de rede do navegador
    // não envie a mesma mensagem 2x. Mesma chave → mesma Message no servidor.
    const idempotencyKey = `${activeId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    try {
      await fetch("/api/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
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
          <h1 className="text-[14px] font-semibold text-zinc-900">{isAgent ? "Meus Chats" : "Chats Globais"}</h1>
          <p className="text-[11px] text-zinc-400">{contacts.length} contatos</p>
        </div>

        {/* Agent filter (admins only) */}
        {!isAgent && (
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
        )}

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
                {!isAgent && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    title="Excluir chat"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
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
                {isOwner && activeContact.chatStatus === "IN_SERVICE" && (
                  <button
                    type="button"
                    onClick={() => void handleEndService()}
                    disabled={ending}
                    title="Encerrar e pedir nota ao cliente"
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {ending ? "Encerrando..." : "Encerrar e pedir nota"}
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
                            : <p translate="no" className="whitespace-pre-wrap break-words px-1 text-[13px] leading-relaxed">{msg.body}</p>
                          }
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

            {/* Read-only footer / owned footer */}
            <footer className="relative flex items-center gap-2 border-t border-zinc-100 bg-white px-4 py-3">
              {isOwner ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    onChange={(e) => void handleFileSelected(e)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSending}
                    title="Anexar arquivo (foto, vídeo, documento)"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isUploading ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEmojis((v) => !v)}
                    title="Emojis"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" />
                      <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                    </svg>
                  </button>
                  {showEmojis && (
                    <EmojiPicker
                      onPick={(e) => setInputValue((v) => v + e)}
                      onClose={() => setShowEmojis(false)}
                    />
                  )}
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void handleSend() }}
                    placeholder={isUploading ? "Enviando arquivo..." : "Digite uma mensagem..."}
                    disabled={isUploading}
                    className="flex-1 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-800 placeholder:text-zinc-400 outline-none focus:border-zinc-300 focus:bg-white disabled:opacity-60"
                  />
                  <button
                    onClick={() => void handleSend()}
                    disabled={!inputValue.trim() || isSending || isUploading}
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

      {/* ─── Confirm Delete Modal ─────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-[15px] font-semibold text-zinc-900">Excluir chat?</h2>
            <p className="mt-1.5 text-[13px] text-zinc-500">
              Isso vai apagar permanentemente o contato <strong>{activeContact?.name}</strong> e todo o histórico de mensagens. Esta ação não pode ser desfeita.
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl border border-zinc-200 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-red-500 py-2 text-[13px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {isDeleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

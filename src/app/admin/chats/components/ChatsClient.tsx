"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
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
      <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1.5 min-w-[260px]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 flex-shrink-0 text-emerald-600" fill="currentColor">
          <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
          <path d="M19 11a1 1 0 10-2 0 5 5 0 11-10 0 1 1 0 10-2 0 7 7 0 006 6.93V21a1 1 0 102 0v-3.07A7 7 0 0019 11z" />
        </svg>
        <audio src={mediaUrl} controls preload="metadata" className="h-9 flex-1 min-w-[200px]">
          <track kind="captions" />
        </audio>
      </div>
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
  const searchParams = useSearchParams()
  const requestedContactId = searchParams.get("contact")

  const [contacts, setContacts] = useState<ContactData[]>(initial)
  const [activeId, setActiveId] = useState<string | null>(requestedContactId ?? initial[0]?.id ?? null)
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [taking, setTaking] = useState(false)
  const [ending, setEnding] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showEmojis, setShowEmojis] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSec, setRecordingSec] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState<{ blob: Blob; url: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showHeaderMenu, setShowHeaderMenu] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const [windowStatus, setWindowStatus] = useState<{
    windowOpen: boolean
    lastInboundAt: string | null
    hoursSinceLastInbound: number | null
    consecutiveOutbound: number
    hasEverReceivedInbound: boolean
  } | null>(null)
  const [quota, setQuota] = useState<{ sent: number; limit: number; ratio: number } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const mediaRecRef     = useRef<MediaRecorder | null>(null)
  const mediaStreamRef  = useRef<MediaStream | null>(null)
  const recordTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevActiveRef   = useRef<string | null>(null)

  const activeContact = contacts.find((c) => c.id === activeId) ?? null
  const isOwner = activeContact?.assignedUserId === currentUserId

  const filteredContacts = (
    agentFilter === "all"
      ? contacts
      : agentFilter === "unassigned"
        ? contacts.filter((c) => !c.assignedUserId)
        : contacts.filter((c) => c.assignedUserId === agentFilter)
  ).filter((c) => {
    // Sempre mostra o contato explicitamente pedido via URL ?contact=
    if (c.id === requestedContactId) return true
    // Sempre mostra o contato que está aberto agora
    if (c.id === activeId) return true
    // Esconde contatos IDLE (Inativo) — eles ficavam poluindo a lista após
    // encerramento automático ou avaliação completa, e o agente achava que
    // tinha "duplicatas".
    return c.chatStatus !== "IDLE"
  })

  // Scroll
  useEffect(() => {
    const behavior = prevActiveRef.current === activeId ? "smooth" : "auto"
    prevActiveRef.current = activeId
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" })
  }, [activeId, activeContact?.messages.length])

  // Quota diaria do agente — busca uma vez ao montar e revalida a cada
  // envio bem sucedido (via dependency em contacts.messages).
  useEffect(() => {
    if (!isAgent) return // admin nao tem limite pessoal
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch("/api/me/quota", { cache: "no-store" })
        if (!res.ok || cancelled) return
        const data = await res.json() as { sent: number; limit: number; ratio: number }
        if (!cancelled) setQuota(data)
      } catch { /* falha silenciosa */ }
    })()
    return () => { cancelled = true }
  }, [isAgent, contacts])

  // Menu "..." do header: fecha em clique fora.
  useEffect(() => {
    if (!showHeaderMenu) return
    const handler = (e: MouseEvent) => {
      if (!headerMenuRef.current?.contains(e.target as Node)) setShowHeaderMenu(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showHeaderMenu])

  // Janela de 24h: revalida ao trocar contato OU ao chegar novo inbound.
  // Sem isso, o banner ficava preso no estado de quando o chat foi aberto.
  useEffect(() => {
    if (!activeId) { setWindowStatus(null); return }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/contacts/${activeId}/window-status`)
        if (!res.ok || cancelled) return
        const data = await res.json() as {
          windowOpen: boolean
          lastInboundAt: string | null
          hoursSinceLastInbound: number | null
          consecutiveOutbound: number
          hasEverReceivedInbound: boolean
        }
        if (!cancelled) setWindowStatus(data)
      } catch { /* falha silenciosa — banner some, envio continua funcionando */ }
    })()
    return () => { cancelled = true }
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

  // Transfere contato (admin only)
  const handleTransfer = useCallback(async (target: { agentId?: string; toMe?: boolean }) => {
    if (!activeId || transferring) return
    setTransferring(true)
    try {
      const res = await fetch(`/api/admin/contacts/${activeId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      })
      if (res.ok) {
        const data = await res.json() as { assignedUserId: string }
        setContacts((prev) => prev.map((c) =>
          c.id === activeId
            ? { ...c, assignedUserId: data.assignedUserId, chatStatus: "IN_SERVICE" as const }
            : c
        ))
        setShowTransfer(false)
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string }
        alert(`Erro ao transferir: ${err.error ?? res.status}`)
      }
    } finally {
      setTransferring(false)
    }
  }, [activeId, transferring])

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

  // Liberar contato — reseta pra IDLE (URA volta a disparar na proxima msg).
  // Usado quando contato ficou colado num agente por causa de teste ou
  // encerramento sem nota. So admin ve.
  const handleRelease = useCallback(async () => {
    if (!activeId || releasing) return
    if (!confirm(
      "Liberar contato?\n\n" +
      "Isso remove a atribuicao de agente e volta o cliente pra URA na proxima mensagem. " +
      "Nao apaga historico, nao pede nota, nao avisa o cliente.",
    )) return
    setReleasing(true)
    try {
      const res = await fetch(`/api/admin/contacts/${activeId}/release`, { method: "POST" })
      if (res.ok) {
        setContacts((prev) => prev.map((c) =>
          c.id === activeId
            ? { ...c, assignedUserId: null, chatStatus: "IDLE" as ContactData["chatStatus"] }
            : c
        ))
        setActiveId(null)
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(data.error ?? "Nao foi possivel liberar.")
      }
    } finally {
      setReleasing(false)
    }
  }, [activeId, releasing])

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
  // Gravação de áudio (estilo WhatsApp: clica pra começar, clica de novo pra parar)
  const stopRecordingStreams = useCallback(() => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop())
    mediaStreamRef.current = null
    mediaRecRef.current = null
  }, [])

  const startRecording = useCallback(async () => {
    if (!isOwner || isUploading || isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "audio/webm"
      const rec = new MediaRecorder(stream, { mimeType })
      const chunks: BlobPart[] = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType })
        const url = URL.createObjectURL(blob)
        setRecordedBlob({ blob, url })
        stopRecordingStreams()
      }
      mediaRecRef.current = rec
      rec.start()
      setIsRecording(true)
      setRecordingSec(0)
      recordTimerRef.current = setInterval(() => setRecordingSec((s) => s + 1), 1000)
    } catch (err) {
      alert("Não consegui acessar o microfone. Permita o acesso no navegador e tente de novo.")
      console.error(err)
      stopRecordingStreams()
      setIsRecording(false)
    }
  }, [isOwner, isUploading, isRecording, stopRecordingStreams])

  const stopRecording = useCallback(() => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop()
    }
    setIsRecording(false)
  }, [])

  const cancelRecording = useCallback(() => {
    if (mediaRecRef.current && mediaRecRef.current.state !== "inactive") {
      mediaRecRef.current.stop()
    }
    stopRecordingStreams()
    setIsRecording(false)
    if (recordedBlob?.url) URL.revokeObjectURL(recordedBlob.url)
    setRecordedBlob(null)
    setRecordingSec(0)
  }, [recordedBlob, stopRecordingStreams])

  const sendAudio = useCallback(async () => {
    if (!recordedBlob || !activeId || isUploading) return
    setIsUploading(true)
    const idempotencyKey = `${activeId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const ext = recordedBlob.blob.type.includes("ogg") ? "ogg" : "webm"
    const file = new File([recordedBlob.blob], `audio-${Date.now()}.${ext}`, { type: recordedBlob.blob.type })
    const formData = new FormData()
    formData.append("file", file)
    formData.append("contactId", activeId)
    formData.append("caption", "")
    try {
      const res = await fetch("/api/messages/send-media", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: formData,
      })
      if (res.ok) {
        URL.revokeObjectURL(recordedBlob.url)
        setRecordedBlob(null)
        setRecordingSec(0)
      } else {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(`Falha ao enviar áudio: ${data.error ?? res.status}`)
      }
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsUploading(false)
    }
  }, [recordedBlob, activeId, isUploading])

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

  const doSend = useCallback(async (text: string, confirmTemplate = false, confirmCold = false): Promise<void> => {
    if (!activeId) return
    const idempotencyKey = `${activeId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const res = await fetch("/api/messages/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        ...(confirmTemplate ? { "X-Confirm-Template": "true" } : {}),
        ...(confirmCold ? { "X-Confirm-Cold": "true" } : {}),
      },
      body: JSON.stringify({ contactId: activeId, text }),
    })

    if (res.ok) {
      setInputValue("") // limpa só se enviou
      return
    }

    if (res.status === 429) {
      const data = await res.json().catch(() => ({})) as { error?: string; code?: string; similarCount?: number; sentToday?: number; limit?: number; consecutiveOutbound?: number }
      if (data.code === "DAILY_LIMIT_REACHED") {
        alert(`🛑 ${data.error}`)
        return
      }
      if (data.code === "TEMPLATE_SPAM_RISK") {
        const ok = confirm(`⚠️ ${data.error}\n\nEnviar mesmo assim? (Risco de bloqueio do WhatsApp)`)
        if (ok) {
          await doSend(text, true, confirmCold) // retry com header X-Confirm-Template
        }
        return
      }
      if (data.code === "COLD_OUTREACH_RISK") {
        const ok = confirm(`⚠️ ${data.error}\n\nEnviar mesmo assim? (Risco do Meta dropar a mensagem)`)
        if (ok) {
          await doSend(text, confirmTemplate, true) // retry com header X-Confirm-Cold
        }
        return
      }
      alert(`⚠️ ${data.error ?? "Não foi possível enviar"}`)
      return
    }

    if (res.status === 422) {
      const data = await res.json().catch(() => ({})) as { error?: string }
      alert(`⚠️ ${data.error ?? "Não foi possível enviar"}`)
      return
    }

    if (res.status >= 500 || res.status === 502) {
      setInputValue("")
      return
    }

    const data = await res.json().catch(() => ({})) as { error?: string }
    alert(`Erro: ${data.error ?? res.status}`)
  }, [activeId])

  const handleSend = async () => {
    if (!inputValue.trim() || !activeId || isSending || !isOwner) return
    const text = inputValue.trim()
    setIsSending(true)
    try {
      await doSend(text)
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
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
          <p className="text-[11px] text-zinc-400">
            {/* Mostra contagem filtrada vs total quando ha filtro ativo,
                pra evitar a percepcao de "conversas sumiram" quando na
                verdade so foi aplicado filtro de agente. */}
            {filteredContacts.length === contacts.length
              ? `${contacts.length} contato${contacts.length === 1 ? "" : "s"}`
              : `${filteredContacts.length} de ${contacts.length} contatos`}
          </p>
          {/* Quota diaria — só pra agente, aviso visual antes de bater no 429.
              Vermelho >= 90%, amarelo >= 70%, verde abaixo. */}
          {isAgent && quota && quota.limit > 0 && (
            <div className="mt-2">
              <div className="flex items-baseline justify-between text-[10px] font-medium">
                <span className="text-zinc-400">Mensagens hoje</span>
                <span className={
                  quota.ratio >= 0.9 ? "text-red-600"
                  : quota.ratio >= 0.7 ? "text-amber-600"
                  : "text-emerald-600"
                }>{quota.sent} / {quota.limit}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full transition-all duration-300 ${
                    quota.ratio >= 0.9 ? "bg-red-500"
                    : quota.ratio >= 0.7 ? "bg-amber-500"
                    : "bg-emerald-500"
                  }`}
                  style={{ width: `${quota.ratio * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Agent filter (admins only) */}
        {!isAgent && (
          <div className="border-b border-zinc-100 px-4 py-2.5">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Filtrar por agente
            </label>
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

                {/* Ação primária — uma só, depende do contexto.
                    isOwner + IN_SERVICE → Encerrar (verde, ação mais comum)
                    !isOwner             → Assumir (preto, alto contraste) */}
                {isOwner && activeContact.chatStatus === "IN_SERVICE" && (
                  <button
                    type="button"
                    onClick={() => void handleEndService()}
                    disabled={ending}
                    title="Encerrar e pedir nota ao cliente"
                    className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {ending ? "Encerrando..." : "Encerrar atendimento"}
                  </button>
                )}
                {!isOwner && (
                  <button
                    type="button"
                    onClick={() => void handleTakeOver()}
                    disabled={taking}
                    className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {taking ? "Assumindo..." : "Assumir atendimento"}
                  </button>
                )}

                {/* Menu "..." — só admin. Agrupa ações secundárias e
                    a destrutiva (Apagar) atrás de mais um clique,
                    evitando erro humano e header sobrecarregado. */}
                {!isAgent && (
                  <div ref={headerMenuRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setShowHeaderMenu((v) => !v)}
                      title="Mais ações"
                      aria-haspopup="menu"
                      aria-expanded={showHeaderMenu}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                        <circle cx="5" cy="12" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="19" cy="12" r="1.6" />
                      </svg>
                    </button>

                    {showHeaderMenu && (
                      <div
                        role="menu"
                        className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg shadow-zinc-200/40"
                      >
                        <button
                          type="button"
                          onClick={() => { setShowHeaderMenu(false); setShowTransfer(true) }}
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-zinc-700 transition-colors hover:bg-zinc-50"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m-4 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          Transferir conversa
                        </button>
                        <div className="my-0.5 h-px bg-zinc-100" />
                        <button
                          type="button"
                          onClick={() => { setShowHeaderMenu(false); void handleRelease() }}
                          disabled={releasing}
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
                          title="Remove atribuicao e devolve o cliente pra URA"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {releasing ? "Liberando…" : "Liberar contato (voltar pra URA)"}
                        </button>
                        <div className="my-0.5 h-px bg-zinc-100" />
                        <button
                          type="button"
                          onClick={() => { setShowHeaderMenu(false); setConfirmDelete(true) }}
                          role="menuitem"
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-red-600 transition-colors hover:bg-red-50"
                        >
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Apagar conversa
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </header>

            {/* Banner janela de 24h — avisa quando cliente não responde há tempo.
                Fora dessa janela, o Meta dropa silenciosamente envios de iniciativa
                do agente como spam. Não bloqueia o envio, só alerta. */}
            {windowStatus && !windowStatus.windowOpen && (
              <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5">
                <div className="flex items-start gap-2 text-[12px] text-amber-900">
                  <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {!windowStatus.hasEverReceivedInbound
                        ? "Cliente nunca respondeu por aqui."
                        : `Cliente sem responder há ${Math.floor(windowStatus.hoursSinceLastInbound ?? 0)}h.`}
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      Fora da janela de 24h, o WhatsApp pode não entregar suas mensagens.
                      Tente outro canal (ligar, SMS) ou peça pro cliente mandar &quot;oi&quot; primeiro.
                    </p>
                  </div>
                </div>
              </div>
            )}

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
              {/* Modo gravação: substitui input + clipe + emoji */}
              {isOwner && isRecording && (
                <div className="flex w-full items-center gap-3 rounded-full border border-red-200 bg-red-50 px-4 py-2.5">
                  <span className="relative inline-flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-red-700">
                    Gravando... {Math.floor(recordingSec / 60).toString().padStart(2, "0")}:{(recordingSec % 60).toString().padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    title="Cancelar"
                    className="rounded-full px-3 py-1 text-[12px] font-medium text-red-700 hover:bg-red-100"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    title="Parar e ouvir antes de enviar"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow hover:bg-red-700"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  </button>
                </div>
              )}
              {/* Modo preview: áudio gravado, antes de enviar */}
              {isOwner && !isRecording && recordedBlob && (
                <div className="flex w-full items-center gap-3 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <audio src={recordedBlob.url} controls className="h-8 flex-1" />
                  <button
                    type="button"
                    onClick={cancelRecording}
                    title="Descartar"
                    className="rounded-full px-3 py-1 text-[12px] font-medium text-zinc-600 hover:bg-zinc-100"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendAudio()}
                    disabled={isUploading}
                    title="Enviar áudio"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
              {/* Modo normal */}
              {isOwner && !isRecording && !recordedBlob && (
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
                  {/* Mic quando input vazio, send button quando tem texto */}
                  {inputValue.trim() === "" ? (
                    <button
                      type="button"
                      onClick={() => void startRecording()}
                      disabled={isUploading || isSending}
                      title="Gravar áudio"
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z" />
                        <path d="M19 11a1 1 0 10-2 0 5 5 0 11-10 0 1 1 0 10-2 0 7 7 0 006 6.93V21a1 1 0 102 0v-3.07A7 7 0 0019 11z" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleSend()}
                      disabled={isSending || isUploading}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  )}
                </>
              )}
              {/* Auditoria — quando não é dono do contato */}
              {!isOwner && (
                <div className="flex w-full items-center justify-center gap-3 rounded-xl border border-amber-200 bg-amber-50 py-3 px-4">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.34 16a2 2 0 001.73 3z" />
                  </svg>
                  <span className="flex-1 text-[12px] text-amber-700">
                    Você não está atendendo este cliente. Para responder, clique no botão.
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleTakeOver()}
                    disabled={taking}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {taking ? "Assumindo..." : "Assumir / Reassumir"}
                  </button>
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

      {/* ─── Transferir Conversa Modal ──────────────────────────────────── */}
      {showTransfer && activeContact && !isAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-[15px] font-semibold text-zinc-900">Transferir &quot;{activeContact.name}&quot;</h2>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              Atual: {agents.find((a) => a.id === activeContact.assignedUserId)?.name ?? "ninguém"}
            </p>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => void handleTransfer({ toMe: true })}
                disabled={transferring}
                className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-zinc-900 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                <span>👤 Trazer pra mim</span>
                <span className="text-[11px] opacity-70">Eu (Admin)</span>
              </button>

              <div className="my-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-zinc-200" />
                <span className="text-[10px] uppercase text-zinc-400">ou transferir para</span>
                <div className="h-px flex-1 bg-zinc-200" />
              </div>

              <div className="max-h-60 space-y-1 overflow-y-auto">
                {agents
                  .filter((a) => a.id !== activeContact.assignedUserId)
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => void handleTransfer({ agentId: a.id })}
                      disabled={transferring}
                      className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-[13px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-600">
                        {a.name.charAt(0).toUpperCase()}
                      </div>
                      {a.name}
                    </button>
                  ))}
                {agents.filter((a) => a.id !== activeContact.assignedUserId).length === 0 && (
                  <p className="px-3 py-2 text-[12px] text-zinc-400">Nenhum outro agente ativo.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTransfer(false)}
                disabled={transferring}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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

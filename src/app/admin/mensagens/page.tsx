"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Avatar from "@/app/admin/components/Avatar"
import { notifyDesktop } from "@/lib/notify"

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserOpt { id: string; name: string; role: string; department: string | null; photoUrl: string | null }

interface ConversationRow {
  id: string
  isGroup: boolean
  name: string
  photoUrl: string | null
  memberCount: number
  memberNames: string[]
  updatedAt: string
  unread: number
  lastMessage: { body: string; mediaType: string | null; createdAt: string; senderName: string; fromMe: boolean } | null
}

interface Msg {
  id: string
  senderId: string
  senderName: string
  senderPhotoUrl?: string | null
  fromMe: boolean
  body: string
  mediaUrl: string | null
  mediaType: string | null
  createdAt: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hhmm(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}

function previewOf(c: ConversationRow): string {
  const lm = c.lastMessage
  if (!lm) return "Nenhuma mensagem ainda"
  const who = lm.fromMe ? "Você: " : (c.isGroup ? `${lm.senderName}: ` : "")
  if (lm.mediaType?.startsWith("audio/")) return `${who}🎤 Áudio`
  if (lm.mediaType?.startsWith("image/")) return `${who}🖼️ Imagem`
  if (lm.mediaType) return `${who}📎 Arquivo`
  return `${who}${lm.body}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MensagensPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Edição de mensagem já enviada (só texto, sem anexo).
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  // Imagem em tela cheia (zoom + baixar).
  const [expandedImg, setExpandedImg] = useState<string | null>(null)

  // Apagar mensagem já enviada.
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null)

  // Meu próprio id — usado só pra não notificar de mensagem que eu mesmo mandei.
  const [myUserId, setMyUserId] = useState<string | null>(null)
  useEffect(() => {
    void fetch("/api/me").then(async (res) => {
      if (!res.ok) return
      const me = (await res.json()) as { id: string }
      setMyUserId(me.id)
    })
  }, [])
  const myUserIdRef = useRef<string | null>(null)
  useEffect(() => { myUserIdRef.current = myUserId }, [myUserId])

  // Novo chat / grupo
  const [showNew, setShowNew] = useState(false)
  const [users, setUsers] = useState<UserOpt[]>([])
  const [newMode, setNewMode] = useState<"dm" | "group">("dm")
  const [groupName, setGroupName] = useState("")
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())

  // Áudio
  const [recording, setRecording] = useState(false)
  const mediaRecRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const activeIdRef = useRef<string | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const active = conversations.find((c) => c.id === activeId) ?? null

  // ── Carrega lista de conversas ──
  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/internal/conversations")
    if (res.ok) setConversations((await res.json()) as ConversationRow[])
  }, [])

  useEffect(() => { void loadConversations() }, [loadConversations])

  // ── Carrega mensagens da conversa ativa ──
  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/internal/conversations/${convId}/messages`)
      if (res.ok) {
        const data = (await res.json()) as { messages: Msg[] }
        setMessages(data.messages)
      }
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  const openConversation = useCallback((convId: string) => {
    setActiveId(convId)
    void loadMessages(convId)
    // zera o contador de não lidas localmente
    setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread: 0 } : c)))
  }, [loadMessages])

  // ── SSE em tempo real ──
  useEffect(() => {
    const es = new EventSource("/api/sse")
    es.onmessage = (e) => {
      let p: { type?: string; data?: (Msg & { conversationId: string }) | { id: string; conversationId: string; body: string; mediaUrl?: string | null; mediaType?: string | null } }
      try { p = JSON.parse(e.data) } catch { return }
      if (!p.data) return

      if (p.type === "internal_message_update") {
        const upd = p.data as { id: string; conversationId: string; body: string; mediaUrl?: string | null; mediaType?: string | null }
        if (upd.conversationId === activeIdRef.current) {
          setMessages((prev) => prev.map((x) => (x.id === upd.id
            ? {
                ...x,
                body: upd.body,
                ...(upd.mediaUrl !== undefined ? { mediaUrl: upd.mediaUrl } : {}),
                ...(upd.mediaType !== undefined ? { mediaType: upd.mediaType } : {}),
              }
            : x)))
        }
        return
      }

      if (p.type !== "internal_message") return
      const m = p.data as Msg & { conversationId: string }
      if (m.conversationId === activeIdRef.current) {
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, fromMe: false }]))
        void fetch(`/api/internal/conversations/${m.conversationId}/read`, { method: "POST" })
      }
      if (m.senderId !== myUserIdRef.current) {
        const preview = m.mediaType ? "📎 Anexo" : m.body
        notifyDesktop(m.senderName || "Mensagem interna", preview, {
          tag: `mensagens-${m.conversationId}`,
          onClick: () => openConversation(m.conversationId),
        })
      }
      void loadConversations()
    }
    return () => es.close()
  }, [loadConversations])

  // ── Auto-scroll pro fim ──
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  // ── Enviar mensagem (texto ou mídia) ──
  const sendMessage = useCallback(async (payload: { body?: string; mediaUrl?: string; mediaType?: string }) => {
    const convId = activeIdRef.current
    if (!convId) return
    setSending(true)
    try {
      const res = await fetch(`/api/internal/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const m = (await res.json()) as Msg
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        void loadConversations()
      }
    } finally {
      setSending(false)
    }
  }, [loadConversations])

  const handleSendText = async () => {
    const t = text.trim()
    if (!t || sending) return
    setText("")
    await sendMessage({ body: t })
  }

  // ── Editar mensagem já enviada ──
  const startEdit = (m: Msg) => {
    setEditingMsgId(m.id)
    setEditingText(m.body)
  }
  const cancelEdit = () => {
    setEditingMsgId(null)
    setEditingText("")
  }
  const saveEdit = async (msgId: string) => {
    const t = editingText.trim()
    if (!t || savingEdit) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/internal/messages/${msgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t }),
      })
      const data = await res.json().catch(() => ({})) as { body?: string; error?: string }
      if (!res.ok) {
        alert(`Não foi possível editar: ${data.error ?? res.status}`)
        return
      }
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, body: data.body ?? t } : m)))
      cancelEdit()
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      setSavingEdit(false)
    }
  }

  // ── Apagar mensagem já enviada ──
  const deleteMsg = async (msgId: string) => {
    if (deletingMsgId) return
    if (!confirm("Apagar esta mensagem? Essa ação não pode ser desfeita.")) return
    setDeletingMsgId(msgId)
    try {
      const res = await fetch(`/api/internal/messages/${msgId}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({})) as { body?: string; error?: string }
      if (!res.ok) {
        alert(`Não foi possível apagar: ${data.error ?? res.status}`)
        return
      }
      setMessages((prev) => prev.map((m) =>
        m.id === msgId ? { ...m, body: data.body ?? m.body, mediaUrl: null, mediaType: null } : m
      ))
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      setDeletingMsgId(null)
    }
  }

  // ── Upload de arquivo/áudio → envia como mensagem ──
  const uploadAndSend = useCallback(async (file: File | Blob, fileName: string) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file, fileName)
      const res = await fetch("/api/internal/upload", { method: "POST", body: fd })
      const data = (await res.json()) as { mediaUrl?: string; mediaType?: string; error?: string }
      if (res.ok && data.mediaUrl) {
        await sendMessage({ mediaUrl: data.mediaUrl, mediaType: data.mediaType })
      } else {
        alert(data.error ?? "Falha no upload")
      }
    } finally {
      setUploading(false)
    }
  }, [sendMessage])

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (f) await uploadAndSend(f, f.name)
  }

  // ── Gravação de áudio ──
  const startRecording = async () => {
    if (recording || uploading) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm"
      const rec = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data) }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        if (blob.size > 0) void uploadAndSend(blob, `audio-${Date.now()}.webm`)
      }
      mediaRecRef.current = rec
      rec.start()
      setRecording(true)
    } catch {
      alert("Não foi possível acessar o microfone.")
    }
  }

  const stopRecording = () => {
    mediaRecRef.current?.stop()
    mediaRecRef.current = null
    setRecording(false)
  }

  const cancelRecording = () => {
    if (mediaRecRef.current) {
      mediaRecRef.current.onstop = null
      mediaRecRef.current.stop()
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRecRef.current = null
    chunksRef.current = []
    setRecording(false)
  }

  // ── Criar conversa / grupo ──
  const openNew = async () => {
    setShowNew(true)
    setNewMode("dm")
    setGroupName("")
    setSelectedUsers(new Set())
    const res = await fetch("/api/internal/users")
    if (res.ok) setUsers((await res.json()) as UserOpt[])
  }

  // "Falar com Equipe" (atalho do admin): abre direto o seletor de pessoa.
  useEffect(() => {
    if (searchParams.get("novo") === "1") {
      void openNew()
      router.replace("/admin/mensagens")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startDM = async (userId: string) => {
    const res = await fetch("/api/internal/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      const data = (await res.json()) as { id: string }
      setShowNew(false)
      await loadConversations()
      openConversation(data.id)
    }
  }

  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.size === 0) return
    const res = await fetch("/api/internal/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupName.trim(), memberIds: [...selectedUsers] }),
    })
    if (res.ok) {
      const data = (await res.json()) as { id: string }
      setShowNew(false)
      await loadConversations()
      openConversation(data.id)
    }
  }

  const toggleUser = (id: string) =>
    setSelectedUsers((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <main className="flex h-full overflow-hidden bg-zinc-50 font-sans">

      {/* ── Coluna: lista de conversas ── */}
      <aside className={`${activeId ? "hidden" : "flex"} w-full flex-shrink-0 flex-col border-r border-zinc-200 bg-white md:flex md:w-72`}>
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-4">
          <div>
            <h1 className="text-[15px] font-semibold text-zinc-900">Mensagens</h1>
            <p className="text-[11px] text-zinc-400">Chat interno da equipe</p>
          </div>
          <button
            type="button" onClick={() => void openNew()}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white hover:bg-zinc-700"
            title="Nova conversa"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 4v12M4 10h12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-zinc-400">
              Nenhuma conversa ainda.<br />Clique em <b>+</b> para começar.
            </p>
          ) : conversations.map((c) => (
            <button
              key={c.id} type="button" onClick={() => openConversation(c.id)}
              className={`flex w-full items-center gap-3 border-b border-zinc-50 px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${activeId === c.id ? "bg-zinc-100" : ""}`}
            >
              {c.isGroup ? (
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-[12px] font-semibold text-violet-600">👥</div>
              ) : (
                <Avatar name={c.name} photoUrl={c.photoUrl} size="h-9 w-9" fallback="bg-emerald-100 text-emerald-700 text-[12px] font-semibold" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-zinc-800">{c.name}</span>
                  {c.lastMessage && <span className="flex-shrink-0 text-[10px] text-zinc-400">{hhmm(c.lastMessage.createdAt)}</span>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] text-zinc-400">{previewOf(c)}</span>
                  {c.unread > 0 && (
                    <span className="flex h-4 min-w-[16px] flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">{c.unread}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* ── Coluna: thread ── */}
      <section className={`${activeId ? "flex" : "hidden"} min-w-0 flex-1 flex-col md:flex`}>
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <p className="mt-3 text-[13px] font-medium text-zinc-500">Selecione uma conversa</p>
            <p className="text-[12px] text-zinc-400">ou clique em + para iniciar uma nova.</p>
          </div>
        ) : (
          <>
            {/* Header da conversa */}
            <header className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-3.5 md:gap-3 md:px-6">
              {/* Voltar — só no celular */}
              <button
                type="button"
                onClick={() => setActiveId(null)}
                aria-label="Voltar"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 md:hidden"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {active.isGroup ? (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100 text-[12px] font-semibold text-violet-600">👥</div>
              ) : (
                <Avatar name={active.name} photoUrl={active.photoUrl} size="h-9 w-9" fallback="bg-emerald-100 text-emerald-700 text-[12px] font-semibold" />
              )}
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-zinc-900">{active.name}</p>
                <p className="truncate text-[11px] text-zinc-400">
                  {active.isGroup ? `${active.memberCount} participantes · ${active.memberNames.join(", ")}` : "Conversa direta"}
                </p>
              </div>
            </header>

            {/* Mensagens */}
            <div className="flex-1 space-y-1 overflow-y-auto bg-zinc-50 px-6 py-4">
              {loadingMsgs ? (
                <p className="py-8 text-center text-[12px] text-zinc-400">Carregando…</p>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-zinc-400">Nenhuma mensagem. Diga olá! 👋</p>
              ) : messages.map((m) => {
                const canEdit = m.fromMe && !m.mediaType
                const canDelete = m.fromMe && m.body !== "🚫 Mensagem apagada"
                const isEditingThis = editingMsgId === m.id
                return (
                  <div key={m.id} className={`group flex ${m.fromMe ? "justify-end" : "justify-start"} mb-1`}>
                    <div className={`relative max-w-[68%] rounded-2xl px-3 py-2.5 shadow-sm ${m.fromMe ? "rounded-tr-sm bg-[#dcf8c6] text-zinc-800" : "rounded-tl-sm border border-zinc-100 bg-white text-zinc-800"}`}>
                      {active.isGroup && !m.fromMe && (
                        <p className="mb-0.5 text-[11px] font-semibold text-emerald-600">{m.senderName}</p>
                      )}
                      {isEditingThis ? (
                        <div className="min-w-[200px] space-y-1.5">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(m.id) }
                              if (e.key === "Escape") cancelEdit()
                            }}
                            rows={2}
                            autoFocus
                            className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-[13px] text-zinc-800 outline-none"
                          />
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={cancelEdit} className="text-[11px] font-medium text-zinc-500 hover:text-zinc-700">Cancelar</button>
                            <button
                              type="button"
                              onClick={() => void saveEdit(m.id)}
                              disabled={savingEdit || !editingText.trim()}
                              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                            >
                              {savingEdit ? "Salvando…" : "Salvar"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {m.mediaType?.startsWith("audio/") ? (
                            <audio controls src={m.mediaUrl ?? undefined} className="max-w-[240px]" />
                          ) : m.mediaType?.startsWith("image/") ? (
                            <button type="button" onClick={() => setExpandedImg(m.mediaUrl ?? null)} className="block cursor-zoom-in">
                              <img src={m.mediaUrl ?? undefined} alt="imagem" className="max-h-60 max-w-[240px] rounded-lg object-cover" />
                            </button>
                          ) : m.mediaType?.startsWith("video/") ? (
                            <video controls src={m.mediaUrl ?? undefined} className="max-h-60 max-w-[240px] rounded-lg" />
                          ) : m.mediaType ? (
                            <a href={m.mediaUrl ?? "#"} target="_blank" rel="noreferrer" className="underline text-emerald-600">📎 Baixar arquivo</a>
                          ) : null}
                          {m.body && <p translate="no" className="whitespace-pre-wrap break-words px-1 text-[13px] leading-relaxed">{m.body}</p>}
                          <div className="mt-1 flex items-center justify-end gap-1 px-1">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => startEdit(m)}
                                title="Editar mensagem"
                                aria-label="Editar mensagem"
                                className="-m-1.5 flex items-center gap-0.5 rounded-md p-1.5 text-zinc-500 opacity-80 transition-opacity hover:bg-black/5 hover:text-zinc-700 hover:opacity-100"
                              >
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void deleteMsg(m.id)}
                                disabled={deletingMsgId === m.id}
                                title="Apagar mensagem"
                                aria-label="Apagar mensagem"
                                className="-m-1.5 flex items-center gap-0.5 rounded-md p-1.5 text-zinc-500 opacity-80 transition-opacity hover:bg-black/5 hover:text-red-600 hover:opacity-100 disabled:opacity-40"
                              >
                                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z" />
                                </svg>
                              </button>
                            )}
                            <span className="text-[10px] text-zinc-400">{hhmm(m.createdAt)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-zinc-200 bg-white px-4 py-3">
              {recording ? (
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-red-600">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> Gravando áudio…
                  </span>
                  <div className="flex-1" />
                  <button type="button" onClick={cancelRecording} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
                  <button type="button" onClick={stopRecording} className="rounded-lg bg-emerald-500 px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-600">Enviar áudio</button>
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <input ref={fileRef} type="file" className="hidden"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    onChange={(e) => void handleFilePick(e)} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || sending}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50" title="Anexar arquivo">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
                  </button>
                  <button type="button" onClick={() => void startRecording()} disabled={uploading || sending}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50" title="Gravar áudio">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>
                  </button>
                  <textarea
                    value={text} onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSendText() } }}
                    onPaste={(e) => {
                      const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"))
                      const file = item?.getAsFile()
                      if (file) {
                        e.preventDefault()
                        void uploadAndSend(file, file.name || `imagem-${Date.now()}.png`)
                      }
                    }}
                    rows={1} placeholder={uploading ? "Enviando arquivo…" : "Escreva uma mensagem…"}
                    className="max-h-28 flex-1 resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white"
                  />
                  <button type="button" onClick={() => void handleSendText()} disabled={!text.trim() || sending}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40" title="Enviar">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Modal: nova conversa ── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button type="button" aria-label="Fechar" className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-sm" onClick={() => setShowNew(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-zinc-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h2 className="text-[14px] font-semibold text-zinc-900">Nova conversa</h2>
              <button type="button" onClick={() => setShowNew(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <div className="flex gap-1 border-b border-zinc-100 px-5 pt-3">
              {(["dm", "group"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setNewMode(m)}
                  className={`rounded-t-lg px-3 py-2 text-[12px] font-semibold ${newMode === m ? "border-b-2 border-emerald-500 text-zinc-900" : "text-zinc-400"}`}>
                  {m === "dm" ? "Pessoa" : "Grupo"}
                </button>
              ))}
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-5">
              {newMode === "group" && (
                <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Nome do grupo"
                  className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm outline-none focus:border-zinc-400 focus:bg-white" />
              )}
              {users.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-zinc-400">Nenhum colega disponível.</p>
              ) : newMode === "dm" ? (
                <div className="space-y-1">
                  {users.map((u) => (
                    <button key={u.id} type="button" onClick={() => void startDM(u.id)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-zinc-50">
                      <Avatar name={u.name} photoUrl={u.photoUrl} size="h-8 w-8" fallback="bg-emerald-100 text-emerald-700 text-[11px] font-semibold" />
                      <span className="flex-1"><span className="block text-[13px] font-medium text-zinc-800">{u.name}</span>
                        <span className="block text-[11px] text-zinc-400">{u.role === "ADMIN" ? "Admin" : "Vendedor"}{u.department ? ` · ${u.department}` : ""}</span></span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {users.map((u) => (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-zinc-50">
                      <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggleUser(u.id)} className="h-4 w-4 rounded border-zinc-300 accent-emerald-500" />
                      <Avatar name={u.name} photoUrl={u.photoUrl} size="h-8 w-8" fallback="bg-emerald-100 text-emerald-700 text-[11px] font-semibold" />
                      <span className="flex-1 text-[13px] font-medium text-zinc-800">{u.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {newMode === "group" && (
              <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3">
                <button type="button" onClick={() => setShowNew(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50">Cancelar</button>
                <button type="button" onClick={() => void createGroup()} disabled={!groupName.trim() || selectedUsers.size === 0}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40">Criar grupo ({selectedUsers.size})</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Imagem em tela cheia (zoom + baixar) ── */}
      {expandedImg && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setExpandedImg(null)}
        >
          <button
            type="button"
            onClick={() => setExpandedImg(null)}
            aria-label="Fechar"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <a
            href={expandedImg}
            download
            onClick={(e) => e.stopPropagation()}
            className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12L8 8m4-4l4 4" />
            </svg>
            Baixar
          </a>
          <img
            src={expandedImg}
            alt="imagem"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </main>
  )
}

"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import type { SSEPayload } from "@/lib/sse-emitter"
import type { ContactData, MessageData } from "@/app/admin/dashboard/types"
import Avatar from "@/app/admin/components/Avatar"
import { notifyDesktop } from "@/lib/notify"
import { handleSessionExpired } from "@/lib/sessionGuard"

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
  const [expanded, setExpanded] = useState(false)
  if (mediaType.startsWith("image/")) {
    return (
      <>
        <div className="space-y-1">
          <button type="button" onClick={() => setExpanded(true)} className="block cursor-zoom-in">
            <img src={mediaUrl} alt={body || "imagem"} className="max-h-48 max-w-xs rounded-xl object-cover" loading="lazy" />
          </button>
          {body && <p className="text-[13px] leading-relaxed">{body}</p>}
        </div>
        {expanded && (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setExpanded(false)}
          >
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Fechar"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <a
              href={mediaUrl}
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
              src={mediaUrl}
              alt={body || "imagem"}
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
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

// ─── Álbum de imagens (igual WhatsApp) ───────────────────────────────────────
// Várias imagens seguidas, do mesmo lado, sem legenda e sem reação, com até
// 3 min entre elas, viram UMA grade só com botão de baixar tudo.
type ChatRenderItem = { kind: "single"; msg: MessageData } | { kind: "album"; msgs: MessageData[] }

const ALBUM_MAX_GAP_MS = 3 * 60 * 1000

function isChatAlbumCandidate(m: MessageData): boolean {
  return Boolean(m.mediaType?.startsWith("image/") && m.mediaUrl && !m.body && !m.myReaction && !m.theirReaction)
}

function groupChatAlbums(messages: MessageData[]): ChatRenderItem[] {
  const items: ChatRenderItem[] = []
  let run: MessageData[] = []
  const flush = () => {
    if (run.length >= 2) items.push({ kind: "album", msgs: run })
    else run.forEach((m) => items.push({ kind: "single", msg: m }))
    run = []
  }
  for (const m of messages) {
    if (!isChatAlbumCandidate(m)) { flush(); items.push({ kind: "single", msg: m }); continue }
    const prev = run[run.length - 1]
    if (prev && (prev.direction !== m.direction ||
        new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > ALBUM_MAX_GAP_MS)) {
      flush()
    }
    run.push(m)
  }
  flush()
  return items
}

// Baixa todas as imagens do álbum em sequência (o navegador pede permissão
// de múltiplos downloads na primeira vez — é só aceitar).
async function downloadAlbum(msgs: MessageData[]): Promise<void> {
  for (const m of msgs) {
    if (!m.mediaUrl) continue
    const a = document.createElement("a")
    a.href = m.mediaUrl
    a.download = m.mediaUrl.split("/").pop() ?? "imagem.jpg"
    document.body.appendChild(a)
    a.click()
    a.remove()
    await new Promise((r) => setTimeout(r, 400))
  }
}

function AlbumBubble({ msgs, isOut }: Readonly<{ msgs: MessageData[]; isOut: boolean }>) {
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null)
  const last = msgs[msgs.length - 1]
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"} mb-1`}>
      <div className={`max-w-[68%] rounded-2xl p-1.5 shadow-sm ${isOut ? "rounded-tr-sm bg-[#dcf8c6]" : "rounded-tl-sm border border-zinc-100 bg-white"}`}>
        <div className="grid grid-cols-2 gap-1">
          {msgs.map((im) => (
            <button key={im.id} type="button" onClick={() => setExpandedUrl(im.mediaUrl ?? null)} className="block cursor-zoom-in">
              <img src={im.mediaUrl ?? undefined} alt="imagem" loading="lazy" className="h-28 w-full rounded-lg object-cover sm:h-36" />
            </button>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={() => void downloadAlbum(msgs)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-black/5"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4" />
            </svg>
            Baixar todas ({msgs.length})
          </button>
          <span className="flex items-center gap-1 text-[10px] text-zinc-400">
            {new Date(last.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {isOut && <MessageStatusIcon status={last.status} />}
          </span>
        </div>
        {expandedUrl && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={() => setExpandedUrl(null)}>
            <button
              type="button"
              onClick={() => setExpandedUrl(null)}
              aria-label="Fechar"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <a
              href={expandedUrl}
              download
              onClick={(e) => e.stopPropagation()}
              className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20"
            >
              Baixar
            </a>
            <img src={expandedUrl} alt="imagem" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    </div>
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

interface QuickReplyTemplateData {
  id: string
  name: string
  category: string
  text: string
  mediaUrl: string | null
  mediaType: string | null
  audioUrl: string | null
  audioType: string | null
}

// Painel de Respostas Rápidas — templates agrupados por categoria, 1 clique
// dispara texto + mídia + áudio em sequência (ver /api/quick-replies/send).
function QuickReplyPanel({
  templates, onSend, onClose, sendingId,
}: Readonly<{
  templates: QuickReplyTemplateData[]
  onSend: (id: string) => void
  onClose: () => void
  sendingId: string | null
}>) {
  const grouped = templates.reduce<Record<string, QuickReplyTemplateData[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t)
    return acc
  }, {})

  return (
    <div className="absolute bottom-14 left-2 z-50 max-h-80 w-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2 shadow-2xl">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Respostas rápidas</span>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700" title="Fechar">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {templates.length === 0 ? (
        <p className="px-2 py-4 text-center text-[12px] text-zinc-400">Nenhum template cadastrado ainda.</p>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="mb-2">
            <p className="mb-0.5 px-1 text-[10px] font-medium text-zinc-400">{category}</p>
            <div className="space-y-0.5">
              {items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={sendingId !== null}
                  onClick={() => onSend(t.id)}
                  title={t.text || "Sem texto"}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {sendingId === t.id ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0 animate-spin" fill="none" stroke="currentColor" strokeWidth={2}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <span className="flex-shrink-0">
                      {t.mediaUrl ? "📎" : t.audioUrl ? "🎤" : "💬"}
                    </span>
                  )}
                  <span className="truncate flex-1">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
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
  const activeIdRef = useRef<string | null>(activeId)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  // Contatos com mensagem nova ainda não vista — quem está noutra conversa
  // (mesmo com a aba em foco) não recebia nenhum aviso antes disso existir.
  const [unreadIds, setUnreadIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!activeId) return
    setUnreadIds((prev) => {
      if (!prev.has(activeId)) return prev
      const next = new Set(prev)
      next.delete(activeId)
      return next
    })
  }, [activeId])
  const [agentFilter, setAgentFilter] = useState<string>("all")
  const [taking, setTaking] = useState(false)
  const [ending, setEnding] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isSending, setIsSending] = useState(false)
  // Trava síncrona (ref, não state) contra clique duplo/Enter repetindo
  // rápido demais: setIsSending(true) não é imediato (batching do React), então
  // 2-3 chamadas de handleSend em sequência rápida liam isSending ainda como
  // false e mandavam a MESMA mensagem repetida (relatado pela Francielli —
  // "Bom dia" saiu 3x). Ref muda na hora, sem esperar re-render.
  const sendingRef = useRef(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showEmojis, setShowEmojis] = useState(false)
  // Respostas rápidas (texto+mídia+áudio com 1 clique).
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState<QuickReplyTemplateData[]>([])
  const [sendingTemplateId, setSendingTemplateId] = useState<string | null>(null)
  useEffect(() => {
    fetch("/api/admin/quick-replies")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: QuickReplyTemplateData[]) => setTemplates(data))
      .catch(() => {})
  }, [])
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
  // Edição de mensagem já enviada (só texto puro, dentro da janela do WhatsApp).
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)
  // Apagar mensagem já enviada (texto ou mídia).
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null)
  // Reação estilo WhatsApp numa mensagem (qualquer uma, nossa ou do cliente).
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null)
  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const mediaRecRef     = useRef<MediaRecorder | null>(null)
  const mediaStreamRef  = useRef<MediaStream | null>(null)
  const recordTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevActiveRef   = useRef<string | null>(null)

  const activeContact = contacts.find((c) => c.id === activeId) ?? null
  // Chat privado: só o dono do atendimento (assignedUserId === currentUserId)
  // pode responder. Para assumir um cliente de outro, usa-se "Requisitar".
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
    // Esconde contatos IDLE (Inativo) SEM agente — esses são os encerrados/
    // avaliados que poluíam a lista e pareciam "duplicatas".
    // MAS um IDLE que ainda está atribuído a alguém é uma conversa que a
    // agente iniciou (ex: cliente novo que ainda não respondeu). Esse NÃO pode
    // sumir da tela — era a causa de "a conversa some e não consigo enviar".
    return c.chatStatus !== "IDLE" || !!c.assignedUserId
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
          // Notifica só mensagem do CLIENTE (inbound) — a própria mensagem
          // enviada não precisa avisar quem acabou de mandar ela.
          if (msg.direction === "INBOUND") {
            const isOtherConversation = contact.id !== activeIdRef.current
            if (isOtherConversation) {
              setUnreadIds((prev) => (prev.has(contact.id) ? prev : new Set(prev).add(contact.id)))
            }
            const preview = msg.mediaType ? "📎 Anexo" : msg.body
            notifyDesktop(contact.name || "Novo cliente", preview, {
              tag: `chat-${contact.id}`,
              onClick: () => setActiveId(contact.id),
              // Aba em foco não quer dizer que ESTA conversa está aberta —
              // sem isso, mensagem de outro cliente chegava muda enquanto o
              // agente atendia alguém mais (relatado pela Francieli).
              force: isOtherConversation,
            })
          }
          return
        }

        if (p.type === "message_update") {
          // Atualiza status da mensagem (SENT/DELIVERED/READ/FAILED). O reaper
          // emite FAILED para mensagens travadas em PENDING > 10min.
          setContacts((prev) => prev.map((c) =>
            c.id === p.data.contactId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === p.data.id
                      ? {
                          ...m,
                          status: p.data.status,
                          ...(p.data.body !== undefined ? { body: p.data.body } : {}),
                          ...(p.data.mediaUrl !== undefined ? { mediaUrl: p.data.mediaUrl } : {}),
                          ...(p.data.mediaType !== undefined ? { mediaType: p.data.mediaType } : {}),
                          ...(p.data.myReaction !== undefined ? { myReaction: p.data.myReaction } : {}),
                          ...(p.data.theirReaction !== undefined ? { theirReaction: p.data.theirReaction } : {}),
                        }
                      : m
                  ),
                }
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

  // Confere o limite de tamanho por tipo. A Z-API aceita video ate 100 MB
  // (send-video); backend (MAX_UPLOAD_BYTES=120MB) e nginx
  // (client_max_body_size=130M) ficam acima pra absorver o overhead do
  // multipart. Teto de video/documento: ~100 MB. Dica: videos em H.264 sao
  // os mais confiaveis; outros codecs passam por conversao interna da
  // Z-API e podem falhar/inflar de tamanho.
  function checkFileSizeLimit(file: File): string | null {
    const maxByCategory =
      file.type.startsWith("image/")    ? 16 * 1024 * 1024    // imagem 16 MB
    : file.type.startsWith("video/")    ? 100 * 1024 * 1024   // vídeo até ~100 MB
    : file.type.startsWith("audio/")    ? 16 * 1024 * 1024    // áudio 16 MB
    : /* documento */                     100 * 1024 * 1024   // documento ~100 MB

    if (file.size > maxByCategory) {
      const limitMB = Math.round(maxByCategory / 1024 / 1024)
      const kind = file.type.startsWith("image/") ? "imagem"
                 : file.type.startsWith("video/") ? "vídeo"
                 : file.type.startsWith("audio/") ? "áudio"
                 : "documento"
      return `Arquivo muito grande: ${file.name} (limite WhatsApp para ${kind}: ${limitMB} MB).`
    }
    return null
  }

  // Sobe um único arquivo pro contato ativo. Não mexe em isUploading —
  // quem chama (sendFile ou sendFiles) controla o loading em volta.
  const uploadOneFile = useCallback(async (file: File, caption: string): Promise<boolean> => {
    if (!activeId) return false
    const idempotencyKey = `${activeId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const formData = new FormData()
    formData.append("file", file)
    formData.append("contactId", activeId)
    formData.append("caption", caption)

    try {
      const res = await fetch("/api/messages/send-media", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: formData,
      })
      if (res.ok) return true
      if (!handleSessionExpired(res.status)) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(`Falha ao enviar ${file.name}: ${data.error ?? res.status}`)
      }
      return false
    } catch (err) {
      alert(`Erro de rede ao enviar ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }, [activeId])

  // Upload e envio de mídia (foto/vídeo/documento) — usado tanto pelo input de
  // arquivo quanto por colar (Ctrl+V) uma imagem copiada.
  const sendFile = useCallback(async (file: File) => {
    if (!activeId || isUploading || !isOwner) return

    const sizeError = checkFileSizeLimit(file)
    if (sizeError) { alert(sizeError); return }

    setIsUploading(true)
    try {
      const ok = await uploadOneFile(file, inputValue.trim())
      if (ok) setInputValue("") // limpa legenda se enviou
    } finally {
      setIsUploading(false)
    }
  }, [activeId, inputValue, isOwner, isUploading, uploadOneFile])

  // Envia vários arquivos em sequência (um de cada vez, pra não sobrecarregar
  // a Z-API nem estourar o rate-limit anti-spam). Só o primeiro leva a
  // legenda digitada; os demais vão sem legenda.
  const sendFiles = useCallback(async (files: File[]) => {
    if (!activeId || isUploading || !isOwner || files.length === 0) return

    for (const file of files) {
      const sizeError = checkFileSizeLimit(file)
      if (sizeError) { alert(sizeError); return }
    }

    setIsUploading(true)
    try {
      const caption = inputValue.trim()
      let sentAny = false
      for (let i = 0; i < files.length; i++) {
        const ok = await uploadOneFile(files[i], i === 0 ? caption : "")
        if (ok) sentAny = true
      }
      if (sentAny) setInputValue("")
    } finally {
      setIsUploading(false)
    }
  }, [activeId, inputValue, isOwner, isUploading, uploadOneFile])

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

    if (handleSessionExpired(res.status)) return

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
    if (!inputValue.trim() || !activeId || sendingRef.current || !isOwner) return
    sendingRef.current = true
    setIsSending(true)
    const text = inputValue.trim()
    try {
      await doSend(text)
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      sendingRef.current = false
      setIsSending(false)
    }
  }

  // Dispara um template de resposta rápida (texto+mídia+áudio) no contato ativo.
  const sendTemplate = async (templateId: string) => {
    if (!activeId || sendingTemplateId) return
    setShowTemplates(false)
    setSendingTemplateId(templateId)
    try {
      const res = await fetch("/api/quick-replies/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: activeId, templateId }),
      })
      if (!res.ok && handleSessionExpired(res.status)) return
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(`Não foi possível enviar o template: ${data.error ?? res.status}`)
      }
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      setSendingTemplateId(null)
    }
  }

  const startEdit = (msg: MessageData) => {
    setEditingMsgId(msg.id)
    setEditingText(msg.body)
  }
  const cancelEdit = () => {
    setEditingMsgId(null)
    setEditingText("")
  }
  const saveEdit = async (msgId: string) => {
    const text = editingText.trim()
    if (!text || savingEdit) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/messages/${msgId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!res.ok && handleSessionExpired(res.status)) return
      const data = await res.json().catch(() => ({})) as { body?: string; error?: string }
      if (!res.ok) {
        alert(`Não foi possível editar: ${data.error ?? res.status}`)
        return
      }
      setContacts((prev) => prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, body: data.body ?? text } : m)),
      })))
      cancelEdit()
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteMsg = async (msgId: string) => {
    if (deletingMsgId) return
    if (!confirm("Apagar esta mensagem para todos? Essa ação não pode ser desfeita.")) return
    setDeletingMsgId(msgId)
    try {
      const res = await fetch(`/api/messages/${msgId}`, { method: "DELETE" })
      if (!res.ok && handleSessionExpired(res.status)) return
      const data = await res.json().catch(() => ({})) as { body?: string; error?: string }
      if (!res.ok) {
        alert(`Não foi possível apagar: ${data.error ?? res.status}`)
        return
      }
      setContacts((prev) => prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === msgId ? { ...m, body: data.body ?? m.body, mediaUrl: null, mediaType: null } : m
        ),
      })))
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      setDeletingMsgId(null)
    }
  }

  const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

  // Reage (ou remove, clicando de novo no mesmo emoji) numa mensagem — nossa
  // ou do cliente, tanto faz, igual reagir no WhatsApp de verdade.
  const reactMsg = async (msgId: string, emoji: string) => {
    if (reactingMsgId) return
    const msg = activeContact?.messages.find((m) => m.id === msgId)
    const next = msg?.myReaction === emoji ? null : emoji
    setReactionPickerMsgId(null)
    setReactingMsgId(msgId)
    try {
      const res = await fetch(`/api/messages/${msgId}/react`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji: next }),
      })
      if (!res.ok && handleSessionExpired(res.status)) return
      const data = await res.json().catch(() => ({})) as { myReaction?: string | null; error?: string }
      if (!res.ok) {
        alert(`Não foi possível reagir: ${data.error ?? res.status}`)
        return
      }
      setContacts((prev) => prev.map((c) => ({
        ...c,
        messages: c.messages.map((m) => (m.id === msgId ? { ...m, myReaction: data.myReaction ?? null } : m)),
      })))
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      setReactingMsgId(null)
    }
  }

  const messageGroups = activeContact ? groupByDate(activeContact.messages) : []

  return (
    <div className="flex h-full overflow-hidden bg-zinc-50 font-sans">

      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={`${activeId ? "hidden" : "flex"} w-full flex-shrink-0 flex-col overflow-hidden border-r border-zinc-100 bg-white md:flex md:w-72`}>
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
            const isUnread = unreadIds.has(c.id)
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex w-full items-start gap-3 border-b border-zinc-50 px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${activeId === c.id ? "bg-zinc-50" : ""}`}
              >
                <Avatar name={c.name} photoUrl={c.profilePhotoUrl} size="h-9 w-9" fallback="bg-zinc-200 text-zinc-600 text-[13px] font-semibold" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`truncate text-[13px] ${isUnread ? "font-bold text-zinc-900" : "font-medium text-zinc-800"}`}>{c.name}</span>
                    <StatusBadge status={c.chatStatus} />
                  </div>
                  <p className={`mt-0.5 truncate text-[11px] ${isUnread ? "font-semibold text-zinc-700" : "text-zinc-400"}`}>
                    {last ? (last.mediaType && !last.body ? "📎 Mídia" : last.body.slice(0, 40)) : "Sem mensagens"}
                  </p>
                </div>
                {isUnread && (
                  <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500" title="Mensagem não lida" />
                )}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ─── Chat area ───────────────────────────────────────────────────── */}
      <main className={`${activeId ? "flex" : "hidden"} flex-1 flex-col overflow-hidden md:flex`}>
        {activeContact ? (
          <>
            {/* Header */}
            <header className="flex items-center justify-between border-b border-zinc-100 bg-white px-4 py-3.5 shadow-sm shadow-zinc-100/60 md:px-6">
              <div className="flex items-center gap-2 md:gap-3">
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
                <Avatar name={activeContact.name} photoUrl={activeContact.profilePhotoUrl} size="h-9 w-9" fallback="bg-zinc-200 text-zinc-600 text-sm font-semibold" />
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
                    !isOwner + AGENT     → Assumir (preto, alto contraste)
                    !isOwner + ADMIN     → sem botão (admin ve tudo mas nao
                                           pode assumir — usa Transferir se
                                           precisar puxar pra alguem). */}
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
                {!isOwner && isAgent && (
                  <button
                    type="button"
                    onClick={() => void handleTakeOver()}
                    disabled={taking}
                    className="rounded-lg bg-zinc-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {taking ? "Assumindo..." : "Assumir atendimento"}
                  </button>
                )}

                {/* Menu "..." — agrupa acoes secundarias. Agente ve so
                    'Transferir conversa' (quando e dono). Admin ve tudo:
                    Transferir + Liberar + Apagar. */}
                {(!isAgent || isOwner) && (
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
                        {!isAgent && (
                          <>
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
                          </>
                        )}
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
                  {groupChatAlbums(group.messages).map((item) => {
                    if (item.kind === "album") {
                      return <AlbumBubble key={item.msgs[0].id} msgs={item.msgs} isOut={item.msgs[0].direction === "OUTBOUND"} />
                    }
                    const msg = item.msg
                    const isOut = msg.direction === "OUTBOUND"
                    // Só dá pra editar texto puro (sem mídia), já enviado, e
                    // só o próprio autor (admin pode editar qualquer uma).
                    // NÃO depende de isOwner: admin edita mensagem que ele
                    // mesmo mandou mesmo em contato que não é "dele".
                    const canEdit = isOut && !msg.mediaUrl
                      && (!isAgent || msg.agentId === currentUserId)
                    const canDelete = isOut && msg.body !== "🚫 Mensagem apagada"
                      && (!isAgent || msg.agentId === currentUserId)
                    const isEditingThis = editingMsgId === msg.id
                    const hasReaction = msg.myReaction || msg.theirReaction
                    return (
                      <div key={msg.id} className={`group flex ${isOut ? "justify-end" : "justify-start"} ${hasReaction ? "mb-4" : "mb-1"}`}>
                        <div className={`relative max-w-[68%] rounded-2xl px-3 py-2.5 shadow-sm ${isOut ? "rounded-tr-sm bg-[#dcf8c6] text-zinc-800" : "rounded-tl-sm border border-zinc-100 bg-white text-zinc-800"}`}>
                          {hasReaction && (
                            <div className={`absolute -bottom-3.5 flex items-center gap-0.5 rounded-full border border-zinc-100 bg-white px-1.5 py-0.5 text-[11px] shadow-sm ${isOut ? "right-2" : "left-2"}`}>
                              {msg.theirReaction && <span title="Reação do cliente">{msg.theirReaction}</span>}
                              {msg.myReaction && <span title="Sua reação">{msg.myReaction}</span>}
                            </div>
                          )}
                          {reactionPickerMsgId === msg.id && (
                            <>
                              <button
                                type="button"
                                aria-label="Fechar seletor de reação"
                                className="fixed inset-0 z-40 cursor-default"
                                onClick={() => setReactionPickerMsgId(null)}
                              />
                              <div className={`absolute -top-11 z-50 flex items-center gap-0.5 rounded-full border border-zinc-100 bg-white px-1.5 py-1 shadow-lg ${isOut ? "right-0" : "left-0"}`}>
                                {QUICK_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => void reactMsg(msg.id, emoji)}
                                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[16px] transition-transform hover:scale-125 ${msg.myReaction === emoji ? "bg-emerald-100" : ""}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                          {isEditingThis ? (
                            <div className="min-w-[220px] space-y-1.5">
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void saveEdit(msg.id) }
                                  if (e.key === "Escape") cancelEdit()
                                }}
                                rows={2}
                                autoFocus
                                className="w-full resize-none rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-[13px] text-zinc-800 outline-none"
                              />
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={cancelEdit} className="text-[11px] font-medium text-zinc-500 hover:text-zinc-700">Cancelar</button>
                                <button
                                  type="button"
                                  onClick={() => void saveEdit(msg.id)}
                                  disabled={savingEdit || !editingText.trim()}
                                  className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                                >
                                  {savingEdit ? "Salvando…" : "Salvar"}
                                </button>
                              </div>
                            </div>
                          ) : msg.mediaUrl && msg.mediaType ? (
                            <MediaBubble mediaUrl={msg.mediaUrl} mediaType={msg.mediaType} body={msg.body} />
                          ) : (
                            <p translate="no" className="whitespace-pre-wrap break-words px-1 text-[13px] leading-relaxed">{msg.body}</p>
                          )}
                          {!isEditingThis && (
                            <div className={`mt-1 flex items-center gap-1 px-1 ${isOut ? "justify-end" : "justify-start"}`}>
                              {isOwner && msg.whatsappKeyId && (
                                <button
                                  type="button"
                                  onClick={() => setReactionPickerMsgId(reactionPickerMsgId === msg.id ? null : msg.id)}
                                  disabled={reactingMsgId === msg.id}
                                  title="Reagir"
                                  aria-label="Reagir"
                                  className="-m-1.5 mr-0.5 flex items-center gap-0.5 rounded-md p-1.5 text-zinc-500 opacity-80 transition-opacity hover:bg-black/5 hover:text-zinc-700 hover:opacity-100 disabled:opacity-40"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <circle cx="12" cy="12" r="10" />
                                    <path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
                                  </svg>
                                </button>
                              )}
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => startEdit(msg)}
                                  title="Editar mensagem"
                                  aria-label="Editar mensagem"
                                  className="-m-1.5 mr-0.5 flex items-center gap-0.5 rounded-md p-1.5 text-zinc-500 opacity-80 transition-opacity hover:bg-black/5 hover:text-zinc-700 hover:opacity-100"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => void deleteMsg(msg.id)}
                                  disabled={deletingMsgId === msg.id}
                                  title="Apagar mensagem"
                                  aria-label="Apagar mensagem"
                                  className="-m-1.5 mr-0.5 flex items-center gap-0.5 rounded-md p-1.5 text-zinc-500 opacity-80 transition-opacity hover:bg-black/5 hover:text-red-600 hover:opacity-100 disabled:opacity-40"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7h12z" />
                                  </svg>
                                </button>
                              )}
                              <span className="text-[10px] text-zinc-400">{formatTime(msg.createdAt)}</span>
                              {isOut && <MessageStatusIcon status={msg.status} />}
                            </div>
                          )}
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
                    multiple
                    className="hidden"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      e.target.value = "" // permite escolher os mesmos arquivos de novo
                      if (files.length === 1) void sendFile(files[0])
                      else if (files.length > 1) void sendFiles(files)
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSending}
                    title="Anexar arquivos (foto, vídeo, documento) — pode selecionar vários"
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
                  <button
                    type="button"
                    onClick={() => setShowTemplates((v) => !v)}
                    disabled={sendingTemplateId !== null}
                    title="Respostas rápidas"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sendingTemplateId ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </button>
                  {showTemplates && (
                    <QuickReplyPanel
                      templates={templates}
                      onSend={(id) => void sendTemplate(id)}
                      onClose={() => setShowTemplates(false)}
                      sendingId={sendingTemplateId}
                    />
                  )}
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) void handleSend() }}
                    onPaste={(e) => {
                      const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"))
                      const file = item?.getAsFile()
                      if (file) {
                        e.preventDefault()
                        void sendFile(file)
                      }
                    }}
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
              {/* Auditoria — quando não é dono do contato.
                  Agente: banner com botao Assumir.
                  Admin: banner so-leitura (admin nao pode assumir, so
                  transferir via menu "..."). */}
              {!isOwner && isAgent && (
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
              {!isOwner && !isAgent && (
                <div className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 py-3 px-4">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-zinc-500" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  <span className="flex-1 text-[12px] text-zinc-500">
                    Modo supervisão (admin). Você vê a conversa mas não pode responder — use <b>&ldquo;…&rdquo;</b> pra transferir.
                  </span>
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
      {showTransfer && activeContact && (!isAgent || isOwner) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-[15px] font-semibold text-zinc-900">Transferir &quot;{activeContact.name}&quot;</h2>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              Atual: {agents.find((a) => a.id === activeContact.assignedUserId)?.name ?? "ninguém"}
            </p>

            <div className="mt-4 space-y-2">
              {/* 'Trazer pra mim' so pra admin — agente ja e dono quando ve
                  esse modal (regra: agente so transfere contato proprio) */}
              {!isAgent && (
                <>
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
                </>
              )}

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

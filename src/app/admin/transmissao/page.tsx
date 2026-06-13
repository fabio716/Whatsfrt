"use client"

import { useState, useEffect, useCallback, useMemo } from "react"

// ─── Types ──────────────────────────────────────────────────────────────────

interface Cooperative { id: string; name: string }
interface AudienceContact { id: string; name: string; whatsappId: string; cooperativeId: string | null }
interface Broadcast {
  id: string
  name: string
  messageText: string
  mediaUrl: string | null
  mediaType: string | null
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
  createdAt: string
  total: number
  sent: number
  delivered: number
  read: number
  failed: number
}

type Mode = "all" | "cooperative" | "manual"

const STATUS_CFG: Record<Broadcast["status"], { label: string; cls: string }> = {
  PENDING:    { label: "Na fila",     cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  PROCESSING: { label: "Enviando",    cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  COMPLETED:  { label: "Concluída",   cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FAILED:     { label: "Falhou",      cls: "bg-red-50 text-red-700 ring-red-200" },
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function BroadcastPage() {
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([])
  const [contacts, setContacts]         = useState<AudienceContact[]>([])
  const [broadcasts, setBroadcasts]     = useState<Broadcast[]>([])

  const [name, setName]               = useState("")
  const [messageText, setMessageText] = useState("")
  const [media, setMedia]             = useState<{ mediaUrl: string; mediaType: string; fileName: string } | null>(null)
  const [uploading, setUploading]     = useState(false)
  const [mode, setMode]               = useState<Mode>("all")
  const [coopId, setCoopId]           = useState("")
  const [selected, setSelected]       = useState<Set<string>>(new Set())
  const [search, setSearch]           = useState("")

  const [sending, setSending] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [okMsg, setOkMsg]     = useState<string | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadAudience = useCallback(async () => {
    const res = await fetch("/api/broadcast/audience")
    if (res.ok) {
      const data = await res.json() as { cooperatives: Cooperative[]; contacts: AudienceContact[] }
      setCooperatives(data.cooperatives)
      setContacts(data.contacts)
    }
  }, [])

  const loadBroadcasts = useCallback(async () => {
    const res = await fetch("/api/broadcast")
    if (res.ok) setBroadcasts(await res.json() as Broadcast[])
  }, [])

  useEffect(() => { void loadAudience(); void loadBroadcasts() }, [loadAudience, loadBroadcasts])

  // Poll broadcasts while any is in progress
  useEffect(() => {
    const active = broadcasts.some((b) => b.status === "PENDING" || b.status === "PROCESSING")
    if (!active) return
    const t = setInterval(() => void loadBroadcasts(), 4000)
    return () => clearInterval(t)
  }, [broadcasts, loadBroadcasts])

  // ── Derived ───────────────────────────────────────────────────────────────
  const manualFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.whatsappId.includes(q))
  }, [contacts, search])

  const recipientCount = useMemo(() => {
    if (mode === "all") return contacts.length
    if (mode === "cooperative") return coopId ? contacts.filter((c) => c.cooperativeId === coopId).length : 0
    return selected.size
  }, [mode, contacts, coopId, selected])

  const toggleContact = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })

  const selectAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      manualFiltered.forEach((c) => next.add(c.id))
      return next
    })

  const clearSelection = () => setSelected(new Set())

  // ── Media upload ──────────────────────────────────────────────────────────────
  const handleUpload = async (file: File) => {
    setUploading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/broadcast/upload", { method: "POST", body: fd })
      const data = await res.json() as { mediaUrl?: string; mediaType?: string; fileName?: string; error?: string }
      if (!res.ok || !data.mediaUrl) throw new Error(data.error ?? "Falha no upload")
      setMedia({ mediaUrl: data.mediaUrl, mediaType: data.mediaType ?? "application/octet-stream", fileName: data.fileName ?? file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload")
    } finally {
      setUploading(false)
    }
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const canSend = Boolean(name.trim() && (messageText.trim() || media) && recipientCount > 0 && !sending && !uploading &&
    (mode !== "cooperative" || coopId))

  const handleSend = async () => {
    if (!canSend) return
    setSending(true); setError(null); setOkMsg(null)
    try {
      let filter: Record<string, unknown>
      if (mode === "all") {
        filter = { type: "all" }
      } else if (mode === "cooperative") {
        filter = { type: "cooperative", value: coopId }
      } else {
        filter = { type: "manual", contactIds: [...selected] }
      }

      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(), messageText: messageText.trim(), filter,
          mediaUrl: media?.mediaUrl, mediaType: media?.mediaType,
        }),
      })
      const data = await res.json() as { total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar transmissão")
      setOkMsg(`Transmissão criada para ${data.total} contato(s). O envio começou.`)
      setName(""); setMessageText(""); setMedia(null); setSelected(new Set()); setCoopId(""); setMode("all")
      void loadBroadcasts()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSending(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl space-y-5">

        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Lista de Transmissão</h1>
          <p className="mt-0.5 text-[13px] text-zinc-500">Envie uma mensagem para vários contatos com segurança e limites anti-bloqueio.</p>
        </div>

        {/* ── New broadcast ── */}
        <div className="space-y-5 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <div>
            <label htmlFor="b-name" className="mb-1.5 block text-[12px] font-semibold text-zinc-700">Nome da transmissão</label>
            <input id="b-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Promoção de Janeiro"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
          </div>

          <div>
            <label htmlFor="b-msg" className="mb-1.5 block text-[12px] font-semibold text-zinc-700">Mensagem</label>
            <textarea id="b-msg" rows={4} value={messageText} onChange={(e) => setMessageText(e.target.value)}
              placeholder="Digite a mensagem. Use {nome} para personalizar com o nome do contato."
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
            <p className="mt-1 text-[11px] text-zinc-400">Dica: <code className="rounded bg-zinc-100 px-1">{"{nome}"}</code> será substituído pelo nome do contato.</p>
          </div>

          {/* Media attachment */}
          <div>
            <p className="mb-1.5 block text-[12px] font-semibold text-zinc-700">Imagem / arquivo (opcional)</p>
            {media ? (
              <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                {media.mediaType.startsWith("image/")
                  ? <img src={media.mediaUrl} alt={media.fileName} className="h-14 w-14 rounded-lg object-cover" />
                  : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-200 text-[10px] font-bold text-zinc-500">FILE</div>}
                <span className="flex-1 truncate text-[13px] text-zinc-700">{media.fileName}</span>
                <button type="button" onClick={() => setMedia(null)}
                  className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50">Remover</button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-[12px] font-medium text-zinc-500 hover:border-zinc-400 hover:bg-white">
                <input type="file" className="hidden" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = "" }} />
                {uploading ? "Enviando arquivo…" : "Clique para anexar uma imagem ou arquivo"}
              </label>
            )}
            <p className="mt-1 text-[11px] text-zinc-400">A mensagem acima vira a legenda da imagem.</p>
          </div>

          {/* Audience mode */}
          <div>
            <p className="mb-2 text-[12px] font-semibold text-zinc-700">Destinatários</p>
            <div className="flex gap-1 rounded-xl border border-zinc-100 bg-zinc-50 p-1">
              {([["all", "Todos os meus contatos"], ["cooperative", "Por empresa"], ["manual", "Seleção manual"]] as const).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${mode === m ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {mode === "cooperative" && (
            <div>
              <label htmlFor="b-coop" className="mb-1.5 block text-[12px] font-medium text-zinc-500">Empresa (cooperativa)</label>
              <select id="b-coop" value={coopId} onChange={(e) => setCoopId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white">
                <option value="">Selecione uma empresa…</option>
                {cooperatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {cooperatives.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600">Nenhuma cooperativa cadastrada ainda.</p>
              )}
            </div>
          )}

          {mode === "manual" && (
            <div className="rounded-xl border border-zinc-100">
              <div className="flex items-center gap-2 border-b border-zinc-100 p-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contato…"
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[13px] text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
                <button type="button" onClick={selectAllVisible} className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50">Selecionar visíveis</button>
                <button type="button" onClick={clearSelection} className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50">Limpar</button>
              </div>
              <div className="max-h-64 overflow-y-auto p-1">
                {manualFiltered.length === 0
                  ? <p className="py-6 text-center text-[12px] text-zinc-400">Nenhum contato encontrado.</p>
                  : manualFiltered.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-zinc-50">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleContact(c.id)}
                        className="h-4 w-4 rounded border-zinc-300 accent-zinc-900" />
                      <span className="flex-1 truncate text-[13px] text-zinc-800">{c.name}</span>
                      <span className="text-[11px] text-zinc-400">{c.whatsappId.replace("@s.whatsapp.net", "")}</span>
                    </label>
                  ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
            <span className="text-[13px] text-zinc-500">
              <strong className="text-zinc-900">{recipientCount}</strong> destinatário(s)
            </span>
            <button type="button" onClick={() => void handleSend()} disabled={!canSend}
              className="rounded-xl bg-zinc-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-40">
              {sending ? "Enviando…" : "Enviar transmissão"}
            </button>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12px] font-medium text-red-600">{error}</p>}
          {okMsg && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[12px] font-medium text-emerald-700">{okMsg}</p>}
        </div>

        {/* ── History ── */}
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <p className="mb-3 text-[13px] font-semibold text-zinc-800">Histórico de transmissões</p>
          {broadcasts.length === 0
            ? <p className="py-6 text-center text-[12px] text-zinc-400">Nenhuma transmissão ainda.</p>
            : (
              <div className="space-y-2">
                {broadcasts.map((b) => {
                  const cfg = STATUS_CFG[b.status]
                  const pct = b.total > 0 ? Math.round((b.sent / b.total) * 100) : 0
                  return (
                    <div key={b.id} className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          {b.mediaUrl && b.mediaType?.startsWith("image/") && (
                            <img src={b.mediaUrl} alt="" className="h-6 w-6 flex-shrink-0 rounded object-cover" />
                          )}
                          <span className="truncate text-[13px] font-medium text-zinc-800">{b.name}</span>
                        </span>
                        <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cfg.cls}`}>{cfg.label}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-zinc-500">{b.sent}/{b.total}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
                        <span className="text-zinc-500">Enviados: <strong className="text-zinc-800">{b.sent}</strong></span>
                        <span className="text-zinc-500">Entregues <span className="text-sky-500">✓✓</span>: <strong className="text-zinc-800">{b.delivered}</strong></span>
                        <span className="text-zinc-500">Lidos: <strong className="text-sky-600">{b.read}</strong></span>
                        <span className="text-zinc-500">Falhas: <strong className={b.failed > 0 ? "text-red-600" : "text-zinc-800"}>{b.failed}</strong></span>
                        <span className="text-zinc-400">Não recebidos: <strong className="text-zinc-700">{Math.max(b.sent - b.delivered, 0)}</strong></span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </div>

      </div>
    </div>
  )
}

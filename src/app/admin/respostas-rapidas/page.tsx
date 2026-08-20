"use client"

import { useState, useEffect, useCallback, useRef } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: string
  name: string
  category: string
  order: number
  text: string
  mediaUrl: string | null
  mediaType: string | null
  audioUrl: string | null
  audioType: string | null
}

const EMPTY_FORM = {
  id: "" as string | null,
  name: "",
  category: "Geral",
  text: "",
  mediaUrl: null as string | null,
  mediaType: null as string | null,
  audioUrl: null as string | null,
  audioType: null as string | null,
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function RespostasRapidasPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingMedia, setUploadingMedia] = useState(false)
  const [uploadingAudio, setUploadingAudio] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const mediaRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/quick-replies")
    if (res.ok) setTemplates((await res.json()) as Template[])
    setLoading(false)
  }, [])
  useEffect(() => { void load() }, [load])

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t)
    return acc
  }, {})

  const openNew = () => { setForm(EMPTY_FORM); setError(null); setShowForm(true) }
  const openEdit = (t: Template) => {
    setForm({
      id: t.id, name: t.name, category: t.category, text: t.text,
      mediaUrl: t.mediaUrl, mediaType: t.mediaType, audioUrl: t.audioUrl, audioType: t.audioType,
    })
    setError(null)
    setShowForm(true)
  }
  const closeForm = () => setShowForm(false)

  const uploadFile = async (file: File, kind: "media" | "audio") => {
    const setUploading = kind === "media" ? setUploadingMedia : setUploadingAudio
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/broadcast/upload", { method: "POST", body: fd })
      const data = await res.json() as { mediaUrl?: string; mediaType?: string; error?: string }
      if (!res.ok || !data.mediaUrl) throw new Error(data.error ?? "Falha no upload")
      if (kind === "media") setForm((f) => ({ ...f, mediaUrl: data.mediaUrl!, mediaType: data.mediaType ?? null }))
      else setForm((f) => ({ ...f, audioUrl: data.mediaUrl!, audioType: data.mediaType ?? null }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload")
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Nome é obrigatório"); return }
    if (!form.text.trim() && !form.mediaUrl && !form.audioUrl) {
      setError("Adicione texto, imagem/vídeo ou áudio")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const url = form.id ? `/api/admin/quick-replies/${form.id}` : "/api/admin/quick-replies"
      const res = await fetch(url, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(), category: form.category.trim() || "Geral", text: form.text.trim(),
          mediaUrl: form.mediaUrl, mediaType: form.mediaType, audioUrl: form.audioUrl, audioType: form.audioType,
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar")
      closeForm()
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Apagar este template? Essa ação não pode ser desfeita.")) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/quick-replies/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        alert(data.error ?? "Não foi possível apagar")
        return
      }
      void load()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-8">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Respostas Rápidas</h1>
            <p className="text-xs text-zinc-400">Templates de texto + imagem/vídeo + áudio pra disparar com 1 clique no Chats</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700">
            + Novo template
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 md:px-8">
        {loading ? (
          <p className="text-center text-[13px] text-zinc-400">Carregando…</p>
        ) : templates.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-12 text-center">
            <p className="text-[13px] font-medium text-zinc-500">Nenhum template ainda</p>
            <p className="mt-1 text-[12px] text-zinc-400">Crie o primeiro pra aparecer no painel de disparo do Chats.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">{category}</h2>
              <div className="space-y-2">
                {items.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-zinc-800">{t.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                        {t.text && <span className="truncate">{t.text.slice(0, 60)}</span>}
                        {t.mediaUrl && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">📎 mídia</span>}
                        {t.audioUrl && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">🎤 áudio</span>}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      <button onClick={() => openEdit(t)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-50">
                        Editar
                      </button>
                      <button onClick={() => void handleDelete(t.id)} disabled={deletingId === t.id}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                        Apagar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ── Form modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <button type="button" aria-label="Fechar" className="absolute inset-0 cursor-default" onClick={closeForm} />
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-[15px] font-semibold text-zinc-900">{form.id ? "Editar template" : "Novo template"}</h2>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="t-name" className="mb-1 block text-[11px] font-semibold text-zinc-600">Nome</label>
                <input id="t-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Explicação 2"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
              </div>
              <div>
                <label htmlFor="t-cat" className="mb-1 block text-[11px] font-semibold text-zinc-600">Categoria</label>
                <input id="t-cat" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="Ex: Prospecção, Follow-up"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
              </div>
              <div>
                <label htmlFor="t-text" className="mb-1 block text-[11px] font-semibold text-zinc-600">Texto</label>
                <textarea id="t-text" rows={4} value={form.text} onChange={(e) => setForm((f) => ({ ...f, text: e.target.value }))}
                  placeholder="Use {nome} pra personalizar com o nome do contato"
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white" />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-600">Imagem / vídeo (opcional)</label>
                {form.mediaUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
                    {form.mediaType?.startsWith("image/")
                      ? <img src={form.mediaUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-200 text-[10px] font-bold text-zinc-500">FILE</div>}
                    <span className="flex-1 truncate text-[12px] text-zinc-600">Anexado</span>
                    <button type="button" onClick={() => setForm((f) => ({ ...f, mediaUrl: null, mediaType: null }))}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">Remover</button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[12px] font-medium text-zinc-500 hover:border-zinc-400 hover:bg-white">
                    <input ref={mediaRef} type="file" className="hidden" accept="image/*,video/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f, "media"); e.target.value = "" }} />
                    {uploadingMedia ? "Enviando…" : "Anexar imagem ou vídeo"}
                  </label>
                )}
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-600">Áudio — enviado como nota de voz (opcional)</label>
                {form.audioUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
                    <audio src={form.audioUrl} controls className="h-8 flex-1" />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, audioUrl: null, audioType: null }))}
                      className="rounded-lg px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">Remover</button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[12px] font-medium text-zinc-500 hover:border-zinc-400 hover:bg-white">
                    <input ref={audioRef} type="file" className="hidden" accept="audio/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f, "audio"); e.target.value = "" }} />
                    {uploadingAudio ? "Enviando…" : "Anexar áudio"}
                  </label>
                )}
              </div>
            </div>

            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] font-medium text-red-600">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeForm} className="rounded-xl px-4 py-2 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100">
                Cancelar
              </button>
              <button type="button" onClick={() => void handleSave()} disabled={saving || uploadingMedia || uploadingAudio}
                className="rounded-xl bg-zinc-900 px-5 py-2 text-[13px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

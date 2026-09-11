"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ─── Status (story do WhatsApp) ───────────────────────────────────────────────
// Publica Status no número da empresa (igual postar pelo celular): texto,
// imagem ou vídeo com legenda. Aberto pra admin e vendedoras.
// Lembrete de negócio: só vê o status quem TEM O NÚMERO SALVO na agenda.

interface StatusPost {
  id: string
  kind: "TEXT" | "IMAGE" | "VIDEO"
  text: string
  mediaUrl: string | null
  mediaType: string | null
  createdByName: string | null
  ok: boolean
  errorMsg: string | null
  createdAt: string
}

type Tab = "TEXT" | "IMAGE" | "VIDEO"

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export default function StatusPage() {
  const [tab, setTab] = useState<Tab>("TEXT")
  const [text, setText] = useState("")
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [mediaType, setMediaType] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [posts, setPosts] = useState<StatusPost[]>([])
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/status")
    if (res.ok) setPosts(await res.json() as StatusPost[])
  }, [])
  useEffect(() => { void load() }, [load])

  const switchTab = (t: Tab) => {
    setTab(t)
    setMediaUrl(null)
    setMediaType(null)
    setOkMsg(null)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const isImage = file.type.startsWith("image/")
    const isVideo = file.type.startsWith("video/")
    if (tab === "IMAGE" && !isImage) { alert("Escolha uma imagem (JPG, PNG...)"); return }
    if (tab === "VIDEO" && !isVideo) { alert("Escolha um vídeo (MP4...)"); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/broadcast/upload", { method: "POST", body: fd })
      const data = await res.json() as { mediaUrl?: string; mediaType?: string; error?: string }
      if (res.ok && data.mediaUrl) {
        setMediaUrl(data.mediaUrl)
        setMediaType(data.mediaType ?? file.type)
      } else {
        alert(data.error ?? "Falha no upload")
      }
    } finally {
      setUploading(false)
    }
  }

  const publish = async () => {
    if (publishing) return
    if (tab === "TEXT" && !text.trim()) { alert("Escreva o texto do status."); return }
    if (tab !== "TEXT" && !mediaUrl) { alert(tab === "IMAGE" ? "Envie a imagem." : "Envie o vídeo."); return }
    if (!confirm("Publicar este status no WhatsApp da empresa?\n\nEle fica visível por 24h pra todos os clientes que têm o número salvo.")) return
    setPublishing(true)
    setOkMsg(null)
    try {
      const res = await fetch("/api/admin/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: tab,
          text: text.trim(),
          ...(tab !== "TEXT" ? { mediaUrl, mediaType } : {}),
        }),
      })
      const data = await res.json().catch(() => ({})) as { error?: string }
      if (res.ok) {
        setOkMsg("✅ Status publicado! Ele fica no ar por 24 horas.")
        setText("")
        setMediaUrl(null)
        setMediaType(null)
        void load()
      } else {
        alert(data.error ?? `Erro ${res.status}`)
        void load()
      }
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "desconhecido"}`)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <main className="min-h-full bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-8">
        <h1 className="text-xl font-semibold text-zinc-900 md:text-2xl">Status</h1>
        <p className="mt-0.5 text-[12.5px] text-zinc-500">
          Publica no Status do WhatsApp da empresa (some em 24h). Só vê quem tem o número salvo na agenda.
        </p>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {/* Publicar */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
            {([["TEXT", "📝 Texto"], ["IMAGE", "📷 Imagem"], ["VIDEO", "🎬 Vídeo"]] as const).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => switchTab(t)}
                className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {tab !== "TEXT" && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept={tab === "IMAGE" ? "image/*" : "video/*"}
                  onChange={(e) => void handleFile(e)}
                />
                {mediaUrl ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    {tab === "IMAGE" ? (
                      <img src={mediaUrl} alt="prévia" className="h-20 w-20 rounded-lg object-cover" />
                    ) : (
                      <video src={mediaUrl} className="h-20 w-28 rounded-lg" />
                    )}
                    <div className="flex-1 text-[12px] text-emerald-800">Arquivo pronto pra publicar.</div>
                    <button
                      type="button"
                      onClick={() => { setMediaUrl(null); setMediaType(null) }}
                      className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-white"
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-8 text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50"
                  >
                    <span className="text-2xl">{tab === "IMAGE" ? "📷" : "🎬"}</span>
                    <span className="text-[13px] font-medium">
                      {uploading ? "Enviando…" : tab === "IMAGE" ? "Clique pra escolher a imagem" : "Clique pra escolher o vídeo"}
                    </span>
                  </button>
                )}
              </div>
            )}

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={tab === "TEXT" ? 4 : 2}
              maxLength={700}
              placeholder={tab === "TEXT" ? "Escreva o texto do status… (ex: 🔥 Promoção da semana: fragmentadoras com 10% off!)" : "Legenda (opcional)"}
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white"
            />

            <button
              type="button"
              onClick={() => void publish()}
              disabled={publishing || uploading}
              className="w-full rounded-xl bg-emerald-500 py-2.5 text-[14px] font-semibold text-white shadow hover:bg-emerald-600 disabled:opacity-50"
            >
              {publishing ? "Publicando…" : "Publicar no Status"}
            </button>

            {okMsg && <p className="text-center text-[13px] font-medium text-emerald-700">{okMsg}</p>}
          </div>
        </section>

        {/* Histórico */}
        <section className="mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">Últimos publicados</h2>
          {posts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-200 py-6 text-center text-[12.5px] text-zinc-400">
              Nenhum status publicado ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {posts.map((p) => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
                  {p.kind === "IMAGE" && p.mediaUrl ? (
                    <img src={p.mediaUrl} alt="status" className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
                  ) : p.kind === "VIDEO" && p.mediaUrl ? (
                    <video src={p.mediaUrl} className="h-12 w-12 flex-shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xl">📝</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-zinc-800">{p.text || (p.kind === "IMAGE" ? "Imagem" : "Vídeo")}</p>
                    <p className="text-[11px] text-zinc-400">
                      {fmtDate(p.createdAt)}{p.createdByName ? ` · ${p.createdByName}` : ""}
                    </p>
                  </div>
                  {p.ok ? (
                    <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Publicado</span>
                  ) : (
                    <span className="flex-shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-600" title={p.errorMsg ?? ""}>Falhou</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

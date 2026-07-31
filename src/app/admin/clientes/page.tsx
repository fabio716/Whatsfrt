"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatStatus = "IDLE" | "IN_URA" | "WAITING_AGENT" | "IN_SERVICE" | "AWAITING_RATING"

interface ClienteRow {
  id: string
  whatsappId: string
  name: string
  empresa: string | null
  cidade: string | null
  chatStatus: ChatStatus
  assignedUserId: string | null
  updatedAt: string
}

interface ClientesResponse {
  items: ClienteRow[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

type Campo = "nome" | "telefone" | "empresa" | "cidade"

// ─── Design helpers ───────────────────────────────────────────────────────────

const STATUS_CFG: Record<ChatStatus, { label: string; cls: string }> = {
  IDLE:            { label: "Livre",       cls: "bg-zinc-100 text-zinc-500" },
  IN_URA:          { label: "Na URA",      cls: "bg-blue-50 text-blue-600" },
  WAITING_AGENT:   { label: "Aguardando",  cls: "bg-amber-50 text-amber-600" },
  IN_SERVICE:      { label: "Em Serviço",  cls: "bg-emerald-50 text-emerald-700" },
  AWAITING_RATING: { label: "Avaliando",   cls: "bg-violet-50 text-violet-600" },
}
const STATUS_FALLBACK = { label: "—", cls: "bg-zinc-100 text-zinc-400" }

const CAMPOS: { value: Campo; label: string }[] = [
  { value: "nome", label: "Nome" },
  { value: "telefone", label: "Telefone" },
  { value: "empresa", label: "Empresa" },
  { value: "cidade", label: "Cidade" },
]

function phone(jid: string) {
  return jid.replace("@s.whatsapp.net", "").replace("@g.us", "")
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MeusClientesPage() {
  const router = useRouter()
  const [items, setItems]   = useState<ClienteRow[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [q, setQ]           = useState("")
  const [campo, setCampo]   = useState<Campo>("nome")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: q.trim(), campo, page: String(page) })
      const res = await fetch(`/api/clientes?${params.toString()}`)
      if (res.ok) {
        const data = (await res.json()) as ClientesResponse
        setItems(data.items)
        setTotal(data.total)
        setHasMore(data.hasMore)
      }
    } finally {
      setLoading(false)
    }
  }, [q, campo, page])

  // Debounce da busca: recarrega 300ms depois da ultima tecla / troca de campo / pagina.
  useEffect(() => {
    const t = setTimeout(() => { void load() }, 300)
    return () => clearTimeout(t)
  }, [load])

  // Contatos são abertos. Ao clicar em Conversar, o contato passa a ser meu
  // (takeover imediato, sem autorização) e o chat abre LIMPO — sem o histórico
  // do agente anterior. Se já é meu, apenas abre.
  const openChat = useCallback(async (id: string) => {
    try {
      await fetch(`/api/contacts/${id}/request-transfer`, { method: "POST" })
    } catch {
      // se falhar por rede, ainda tenta abrir (pode já ser meu)
    }
    router.push(`/admin/chats?contact=${id}`)
  }, [router])

  return (
    <main className="h-full overflow-y-auto bg-zinc-50 font-sans">

      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Clientes</h1>
          <p className="text-xs text-zinc-400">Todos os clientes cadastrados. Busque e inicie uma conversa.</p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-8 py-6">

        {/* Search */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }}
              placeholder={`Buscar por ${CAMPOS.find((c) => c.value === campo)?.label.toLowerCase()}...`}
              className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5"
            />
          </div>
          <select
            value={campo} onChange={(e) => { setCampo(e.target.value as Campo); setPage(1) }}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-700 outline-none focus:border-zinc-400"
          >
            {CAMPOS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
          {loading ? (
            <div className="divide-y divide-zinc-50">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-zinc-100" />
                  <div className="h-3 w-32 rounded bg-zinc-100" />
                  <div className="h-3 w-40 rounded bg-zinc-100/70" />
                  <div className="ml-auto h-6 w-20 rounded-full bg-zinc-100/60" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              {q ? (
                <>
                  <p className="text-[13px] font-semibold text-zinc-700">Nenhum cliente encontrado</p>
                  <p className="text-[12px] text-zinc-400">Tente outro termo ou mude o campo de busca.</p>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-semibold text-zinc-700">Nenhum cliente cadastrado</p>
                  <p className="text-[12px] text-zinc-400">Use &quot;Adicionar contato&quot; no menu para cadastrar clientes.</p>
                </>
              )}
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  {["Nome", "Empresa / Cidade", "Telefone", "Status", ""].map((h, i, arr) => (
                    <th key={`${h}-${i}`} className={`px-5 py-3.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 ${i === arr.length - 1 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {items.map((c) => {
                  const st = STATUS_CFG[c.chatStatus] ?? STATUS_FALLBACK
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-zinc-50/70">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                            {c.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-zinc-800">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-zinc-600">
                        {c.empresa || c.cidade ? (
                          <div className="space-y-0.5">
                            {c.empresa && <p className="truncate text-zinc-700">{c.empresa}</p>}
                            {c.cidade && <p className="truncate text-[11px] text-zinc-400">{c.cidade}</p>}
                          </div>
                        ) : (
                          <span className="text-zinc-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-zinc-500">{phone(c.whatsappId)}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => void openChat(c.id)}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-600 transition-colors"
                        >
                          💬 Conversar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer / paginação */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">{total} cliente(s)</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs text-zinc-500">Página {page}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore || loading}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>

      </div>
    </main>
  )
}

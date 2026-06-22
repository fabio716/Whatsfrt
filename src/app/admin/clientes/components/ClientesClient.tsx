"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

type Campo = "nome" | "empresa" | "cidade" | "telefone"

interface Cliente {
  id: string
  whatsappId: string
  name: string
  empresa: string | null
  cidade: string | null
  chatStatus: "IDLE" | "IN_URA" | "WAITING_AGENT" | "IN_SERVICE" | "AWAITING_RATING"
  assignedUserId: string | null
  updatedAt: string
}

interface ApiResponse {
  items: Cliente[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

const STATUS_LABEL: Record<Cliente["chatStatus"], { text: string; cls: string }> = {
  IDLE:            { text: "Livre",          cls: "bg-zinc-100 text-zinc-500" },
  IN_URA:          { text: "URA",            cls: "bg-blue-50 text-blue-700" },
  WAITING_AGENT:   { text: "Aguardando",     cls: "bg-amber-50 text-amber-700" },
  IN_SERVICE:      { text: "Em atendimento", cls: "bg-emerald-50 text-emerald-700" },
  AWAITING_RATING: { text: "Avaliando",      cls: "bg-purple-50 text-purple-700" },
}

function formatPhone(jid: string): string {
  const d = jid.replace("@s.whatsapp.net", "").replace(/@.*/, "")
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`
  }
  if (d.length === 12 && d.startsWith("55")) {
    return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`
  }
  return d
}

export default function ClientesClient({ isAgent }: Readonly<{ isAgent: boolean }>) {
  const router = useRouter()
  const [campo, setCampo] = useState<Campo>("nome")
  const [q, setQ] = useState("")
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Cliente | null>(null)

  // Debounce de busca + reset paginação ao mudar filtro
  useEffect(() => { setPage(1) }, [campo, q])

  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      // Só busca se 3+ caracteres OU vazio (mostra tudo)
      if (q.length > 0 && q.length < 3) return
      setLoading(true)
      try {
        const params = new URLSearchParams({ campo, page: String(page) })
        if (q) params.set("q", q)
        const res = await fetch(`/api/clientes?${params.toString()}`, { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as ApiResponse
        if (alive) setData(json)
      } finally {
        if (alive) setLoading(false)
      }
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [campo, q, page])

  const placeholder = useMemo(() => {
    switch (campo) {
      case "empresa":  return "Buscar por empresa…"
      case "cidade":   return "Buscar por cidade…"
      case "telefone": return "Buscar por telefone (digite os dígitos)…"
      default:         return "Buscar por nome (mínimo 3 letras)…"
    }
  }, [campo])

  const openChat = useCallback((cliente: Cliente) => {
    // Abre /admin/chats já apontando pra este contato
    router.push(`/admin/chats?contact=${cliente.id}`)
  }, [router])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Cabeçalho + filtros */}
      <header className="border-b border-zinc-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Clientes Cadastrados</h1>
            <p className="text-[12px] text-zinc-500">
              {isAgent ? "Sua carteira de clientes" : "Todos os contatos cadastrados no sistema"}
              {data && ` · ${data.total} encontrado${data.total === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {/* Tabs de campo */}
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            {(["nome", "empresa", "cidade", "telefone"] as Campo[]).map((c) => (
              <button
                key={c}
                onClick={() => setCampo(c)}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  campo === c ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                {c === "nome" ? "Nome" : c === "empresa" ? "Empresa" : c === "cidade" ? "Cidade" : "Telefone"}
              </button>
            ))}
          </div>

          {/* Input de busca */}
          <div className="relative flex-1">
            <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-800 outline-none focus:border-zinc-400"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-100"
                title="Limpar"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {q.length > 0 && q.length < 3 && (
          <p className="mt-2 text-[12px] text-zinc-400">Digite pelo menos 3 caracteres para buscar.</p>
        )}
      </header>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto bg-zinc-50">
        {loading && !data && (
          <p className="px-6 py-6 text-sm text-zinc-400">Carregando…</p>
        )}

        {data && data.items.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-zinc-500">Nenhum cliente encontrado.</p>
            {isAgent && (
              <p className="mt-1 text-[12px] text-zinc-400">
                Sua carteira está vazia? Importe contatos em <a href="/admin/importar" className="underline">Importar Contatos</a>.
              </p>
            )}
          </div>
        )}

        {data && data.items.length > 0 && (
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 border-b border-zinc-200 bg-white text-left text-[11px] uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-6 py-2.5">Nome</th>
                <th className="px-3 py-2.5">Empresa</th>
                <th className="px-3 py-2.5">Cidade</th>
                <th className="px-3 py-2.5">Telefone</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {data.items.map((c) => {
                const status = STATUS_LABEL[c.chatStatus]
                return (
                  <tr key={c.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[13px] font-semibold text-zinc-600">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-zinc-800">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-zinc-600">{c.empresa ?? <span className="text-zinc-300">—</span>}</td>
                    <td className="px-3 py-3 text-zinc-600">{c.cidade ?? <span className="text-zinc-300">—</span>}</td>
                    <td className="px-3 py-3 tabular-nums text-zinc-600">{formatPhone(c.whatsappId)}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${status.cls}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setEditing(c)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
                          title="Editar empresa/cidade"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => openChat(c)}
                          className="rounded-lg bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-600"
                          title="Abrir conversa"
                        >
                          💬 Conversar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Paginação */}
        {data && data.hasMore && (
          <div className="flex justify-center py-4">
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loading}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {loading ? "Carregando…" : "Carregar mais"}
            </button>
          </div>
        )}
      </div>

      {/* Modal de edição empresa/cidade */}
      {editing && (
        <EditModal
          cliente={editing}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            setData((prev) => prev ? {
              ...prev,
              items: prev.items.map((i) => i.id === updated.id ? { ...i, empresa: updated.empresa, cidade: updated.cidade } : i),
            } : prev)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function EditModal({
  cliente,
  onClose,
  onSave,
}: Readonly<{
  cliente: Cliente
  onClose: () => void
  onSave: (updated: { id: string; empresa: string | null; cidade: string | null }) => void
}>) {
  const [empresa, setEmpresa] = useState(cliente.empresa ?? "")
  const [cidade, setCidade] = useState(cliente.cidade ?? "")
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cliente.id, empresa: empresa.trim() || null, cidade: cidade.trim() || null }),
      })
      if (res.ok) {
        const data = await res.json() as { id: string; empresa: string | null; cidade: string | null }
        onSave(data)
      } else {
        const err = await res.json().catch(() => ({})) as { error?: string }
        alert(`Erro: ${err.error ?? res.status}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-[15px] font-semibold text-zinc-900">{cliente.name}</h2>
        <p className="mt-0.5 text-[12px] text-zinc-400">Editar dados comerciais</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Empresa</span>
            <input
              type="text"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Ex: Sicredi Univales"
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-300 focus:bg-white"
              maxLength={200}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Cidade</span>
            <input
              type="text"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Ex: Toledo - PR"
              className="mt-1 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-300 focus:bg-white"
              maxLength={100}
            />
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  )
}

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentOption { id: string; name: string; department: string | null }
interface CooperativeOption { id: string; name: string }

interface ContactRow {
  id: string
  name: string
  whatsappId: string
  empresa: string | null
  cidade: string | null
  chatStatus: "IDLE" | "IN_URA" | "WAITING_AGENT" | "IN_SERVICE" | "AWAITING_RATING"
  assignedUser: { id: string; name: string } | null
  cooperative: { id: string; name: string } | null
  createdAt: string
}

interface ImportResult {
  total: number; created: number; existing: number; skipped: number; agentName: string | null
}

// ─── Design helpers ───────────────────────────────────────────────────────────

const STATUS_CFG: Record<ContactRow["chatStatus"], { label: string; cls: string }> = {
  IDLE:            { label: "Livre",        cls: "bg-zinc-100 text-zinc-500" },
  IN_URA:          { label: "Na URA",       cls: "bg-blue-50 text-blue-600" },
  WAITING_AGENT:   { label: "Aguardando",   cls: "bg-amber-50 text-amber-600" },
  IN_SERVICE:      { label: "Em Serviço",   cls: "bg-emerald-50 text-emerald-700" },
  AWAITING_RATING: { label: "Avaliando",    cls: "bg-violet-50 text-violet-600" },
}

// Fallback defensivo: qualquer status desconhecido/novo nao pode mais quebrar
// a pagina (antes, um status fora do mapa gerava undefined -> tela preta).
const STATUS_FALLBACK = { label: "—", cls: "bg-zinc-100 text-zinc-400" }

function phone(jid: string) {
  return jid.replace("@s.whatsapp.net", "").replace("@g.us", "")
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContatosPage() {
  const router = useRouter()
  const [contacts, setContacts]       = useState<ContactRow[]>([])
  const [agents,   setAgents]         = useState<AgentOption[]>([])
  const [cooperatives, setCooperatives] = useState<CooperativeOption[]>([])
  const [loading,  setLoading]        = useState(true)
  const [search,   setSearch]         = useState("")
  const [filterAgent, setFilterAgent] = useState("")

  // ── import state
  const [showImport,   setShowImport]   = useState(false)
  const [importAgent,  setImportAgent]  = useState("")
  const [importCoop,   setImportCoop]   = useState("")
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError,  setImportError]  = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Sincronização de fotos de perfil (roda em lote até acabar).
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  // Papel do usuário — exportar CSV continua exclusivo do admin mesmo com a
  // tela aberta pro agente.
  const [isAdmin, setIsAdmin] = useState(false)
  // Resumo final: quantas fotos foram encontradas x quantas não (contato sem
  // foto pública no WhatsApp) — fica visível depois de terminar a varredura.
  const [syncSummary, setSyncSummary] = useState<{ ok: number; semFoto: number } | null>(null)

  // ── load data
  // Usa /api/internal/users (aberto pra qualquer autenticado) em vez de
  // /api/admin/users — esse último devolve email e é exclusivo da tela de
  // Equipe (admin). Aqui só precisamos de id/nome/role/department.
  const load = useCallback(async () => {
    const [cRes, uRes, coopRes] = await Promise.all([
      fetch("/api/admin/contacts"),
      fetch("/api/internal/users"),
      fetch("/api/admin/ura/cooperatives"),
    ])
    if (cRes.ok) setContacts((await cRes.json()) as ContactRow[])
    if (uRes.ok) {
      const users = (await uRes.json()) as (AgentOption & { role: string })[]
      setAgents(users.filter((u) => u.role === "AGENT"))
    }
    if (coopRes.ok) setCooperatives((await coopRes.json()) as CooperativeOption[])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    void fetch("/api/me").then(async (res) => {
      if (!res.ok) return
      const me = (await res.json()) as { role: string }
      setIsAdmin(me.role === "ADMIN")
    })
  }, [])

  // ── filtered list — busca multi-campo (nome, telefone, empresa, cidade).
  // Antes era so nome+telefone. Empresa+cidade vieram da fusao com Clientes
  // Cadastrados.
  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase().trim()
    const matchSearch = !q
      || c.name.toLowerCase().includes(q)
      || phone(c.whatsappId).includes(q)
      || (c.empresa?.toLowerCase().includes(q) ?? false)
      || (c.cidade?.toLowerCase().includes(q) ?? false)
    const matchAgent = !filterAgent
      || (filterAgent === "__none__" ? c.assignedUser === null : c.assignedUser?.id === filterAgent)
    return matchSearch && matchAgent
  })

  // ── import
  const handleImport = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file || importing) return
    setImporting(true)
    setImportError(null)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (importAgent) fd.append("userId", importAgent)
      if (importCoop) fd.append("cooperativeId", importCoop)
      const res  = await fetch("/api/admin/contacts/import", { method: "POST", body: fd })
      const data = (await res.json()) as ImportResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro na importação")
      setImportResult(data)
      void load()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setImporting(false)
    }
  }

  // ── export all
  const handleExport = async () => {
    const q = filterAgent ? `?userId=${filterAgent}` : ""
    const res = await fetch(`/api/admin/contacts/export${q}`)
    if (!res.ok) return
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement("a"), { href: url, download: "contatos.csv" })
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── sincronizar fotos (busca foto de perfil no WhatsApp em lotes) ──
  const handleSyncPhotos = async () => {
    if (syncing) return
    setSyncing(true)
    setSyncMsg("Sincronizando fotos…")
    setSyncSummary(null)
    let totalOk = 0
    let totalSemFoto = 0
    let cursorId: string | undefined
    try {
      // Roda em loop, avançando pelo cursor (id) — sem isso, um lote onde
      // ninguém tem foto pública ficava reprocessando os MESMOS contatos pra
      // sempre e nunca chegava no resto da base. Lote do servidor agora é
      // pequeno (25, por causa do timeout do Cloudflare), então precisa de
      // bem mais voltas pra cobrir uma base grande — até 400 chamadas.
      for (let i = 0; i < 400; i++) {
        const res = await fetch("/api/admin/contacts/sync-photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cursorId ? { cursorId } : {}),
        })
        if (!res.ok) { setSyncMsg("Erro ao sincronizar fotos."); break }
        const d = (await res.json()) as {
          processados: number; updated: number; semFoto: number; restantes: number
          nextCursor: string | null; fimDaLista: boolean
        }
        totalOk += d.updated
        totalSemFoto += d.semFoto
        cursorId = d.nextCursor ?? undefined
        setSyncMsg(`✅ ${totalOk} com foto · ⚪ ${totalSemFoto} sem foto pública · faltam ${d.restantes}…`)
        if (d.processados === 0 || d.fimDaLista) break
      }
      setSyncMsg(`✓ Concluído — ✅ ${totalOk} com foto · ⚪ ${totalSemFoto} sem foto pública.`)
      setSyncSummary({ ok: totalOk, semFoto: totalSemFoto })
      void load()
    } catch {
      setSyncMsg("Erro ao sincronizar fotos.")
    } finally {
      setSyncing(false)
    }
  }

  const closeImport = () => {
    setShowImport(false)
    setImportResult(null)
    setImportError(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  const total     = contacts.length
  const assigned  = contacts.filter((c) => c.assignedUser).length
  const inService = contacts.filter((c) => c.chatStatus === "IN_SERVICE").length

  return (
    <main className="h-full overflow-y-auto bg-zinc-50 font-sans">

      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Contatos</h1>
            <p className="text-xs text-zinc-400">{syncMsg ?? "Gerencie e importe sua base de contatos"}</p>
            {syncSummary && !syncing && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  ✅ {syncSummary.ok} com foto
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                  ⚪ {syncSummary.semFoto} sem foto pública
                </span>
                <button
                  type="button"
                  onClick={() => setSyncSummary(null)}
                  className="text-[11px] text-zinc-300 hover:text-zinc-500"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleSyncPhotos()}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600 transition-all hover:bg-zinc-50 disabled:opacity-60"
              title="Busca a foto de perfil do WhatsApp dos contatos que ainda não têm"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 3a5 5 0 00-8.5 3M5 13a5 5 0 008.5-3M2 4v2.5h2.5M14 12V9.5h-2.5" />
              </svg>
              {syncing ? "Sincronizando…" : "Sincronizar fotos"}
            </button>
            {isAdmin && (
              <button
                onClick={() => void handleExport()}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-600 transition-all hover:bg-zinc-50"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3M8 9V2m0 7l-2.5-2.5M8 9l2.5-2.5" />
                </svg>
                Exportar CSV
              </button>
            )}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3M8 2v7m-2.5-2.5L8 9l2.5-2.5" />
              </svg>
              Importar CSV
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-8 py-6">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total",        value: total,     color: "text-zinc-900" },
            { label: "Com agente",   value: assigned,  color: "text-blue-600" },
            { label: "Em atendimento", value: inService, color: "text-emerald-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-zinc-100 bg-white px-6 py-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone, empresa ou cidade..."
              className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-900/5"
            />
          </div>
          <select
            value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm text-zinc-700 outline-none focus:border-zinc-400"
          >
            <option value="">Todos os agentes</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            <option value="__none__">Sem agente</option>
          </select>
        </div>

        {/* Table — overflow-x-auto pra que tabelas largas (com varios campos)
            nao cortem a coluna de Acoes em monitores menores. */}
        <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
          {loading ? (
            // Skeleton: 8 linhas pulsando no formato da tabela. Da percepcao
            // imediata de que a estrutura ja existe, conteudo so falta chegar.
            <div className="divide-y divide-zinc-50">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
                  <div className="h-8 w-8 flex-shrink-0 rounded-full bg-zinc-100" />
                  <div className="h-3 w-32 rounded bg-zinc-100" />
                  <div className="h-3 w-40 rounded bg-zinc-100/70" />
                  <div className="h-3 w-24 rounded bg-zinc-100/70" />
                  <div className="ml-auto h-6 w-20 rounded-full bg-zinc-100/60" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
                <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-400" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              {contacts.length === 0 ? (
                <>
                  <p className="text-[13px] font-semibold text-zinc-700">Nenhum contato cadastrado</p>
                  <p className="text-[12px] text-zinc-400">Importe um CSV ou adicione contatos manualmente.</p>
                </>
              ) : (
                <>
                  <p className="text-[13px] font-semibold text-zinc-700">Nenhum contato encontrado</p>
                  <p className="text-[12px] text-zinc-400">Tente outro termo ou limpe os filtros.</p>
                  {(search || filterAgent) && (
                    <button
                      type="button"
                      onClick={() => { setSearch(""); setFilterAgent("") }}
                      className="mt-1 rounded-lg border border-zinc-200 bg-white px-3.5 py-1.5 text-[12px] font-medium text-zinc-700 transition-colors hover:bg-zinc-50 active:scale-95"
                    >
                      Limpar filtros
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  {["Nome", "Empresa / Cidade", "Telefone", "Status", "Agente", ""].map((h, i, arr) => (
                    <th key={`${h}-${i}`} className={`px-5 py-3.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 ${i === arr.length - 1 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filtered.map((c) => {
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
                      <td className="px-5 py-3.5 text-zinc-500">
                        {c.assignedUser
                          ? <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />{c.assignedUser.name}</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => router.push(`/admin/chats?contact=${c.id}`)}
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

        <p className="text-right text-xs text-zinc-400">{filtered.length} de {total} contatos</p>
      </div>

      {/* ── Import Slide-over ── */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-end justify-end">
          <button type="button" aria-label="Fechar" className="absolute inset-0 w-full cursor-default bg-black/20 backdrop-blur-sm" onClick={closeImport} />
          <div className="relative h-full w-full max-w-md border-l border-zinc-100 bg-white shadow-2xl flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
              <div>
                <h2 className="text-[15px] font-semibold text-zinc-900">Importar Catálogo CSV</h2>
                <p className="mt-0.5 text-xs text-zinc-400">Adicione contatos em massa a partir de um arquivo CSV</p>
              </div>
              <button onClick={closeImport} className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto space-y-5 px-6 py-6">

              {/* Format hint */}
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-4 text-[12px] text-zinc-500 space-y-1">
                <p className="font-semibold text-zinc-700">Formato do CSV</p>
                <p>Colunas obrigatórias: <code className="bg-white px-1 rounded">nome</code> + <code className="bg-white px-1 rounded">telefone</code></p>
                <p>Formatos aceitos: <code className="bg-white px-1 rounded">11 99999-9999</code> · <code className="bg-white px-1 rounded">5511999999999</code></p>
                <p className="text-zinc-400">Google Contacts · Sheets · Excel · outros sistemas</p>
              </div>

              {/* Agent selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Atribuir ao agente <span className="normal-case text-zinc-400">(opcional)</span>
                </label>
                <select
                  value={importAgent}
                  onChange={(e) => setImportAgent(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white"
                >
                  <option value="">Sem agente (livre)</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}{a.department ? ` — ${a.department}` : ""}</option>
                  ))}
                </select>
              </div>

              {/* Cooperative selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Empresa / Cooperativa <span className="normal-case text-zinc-400">(opcional)</span>
                </label>
                <select
                  value={importCoop}
                  onChange={(e) => setImportCoop(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:bg-white"
                >
                  <option value="">Nenhuma</option>
                  {cooperatives.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* File picker */}
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500" htmlFor="import-file">
                  Arquivo CSV
                </label>
                <input
                  id="import-file" ref={fileRef} type="file" accept=".csv,text/csv"
                  className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-[11px] file:font-semibold file:text-white file:cursor-pointer"
                />
              </div>

              {/* Result */}
              {importResult && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-700 space-y-0.5">
                  <p className="font-semibold">✓ Importação concluída{importResult.agentName ? ` para ${importResult.agentName}` : ""}</p>
                  <p>Total: {importResult.total} · Novos: {importResult.created} · Já existentes (mantidos): {importResult.existing} · Ignorados: {importResult.skipped}</p>
                </div>
              )}

              {importError && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600">{importError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
              <button type="button" onClick={closeImport} className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50">
                Fechar
              </button>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={importing}
                className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-60"
              >
                {importing ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

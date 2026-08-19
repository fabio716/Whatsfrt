"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"

interface UserRow {
  id: string
  name: string
  email: string
  role: "ADMIN" | "AGENT"
  department: string | null
  isActive: boolean
  createdAt: string
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const ROLE_CFG = {
  ADMIN:  { label: "Admin",   cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  AGENT:  { label: "Agente",  cls: "bg-blue-50 text-blue-700 ring-blue-200" },
} satisfies Record<string, { label: string; cls: string }>

const DEPT_CFG: Record<string, { label: string; cls: string }> = {
  VENDAS:                 { label: "Vendas",                cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  FINANCEIRO:             { label: "Financeiro",            cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  GERENCIA:               { label: "Gerência",              cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  SUPORTE:                { label: "Suporte",               cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  ATENDIMENTO:            { label: "Atendimento",           cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  COBRANCA:               { label: "Cobrança",              cls: "bg-rose-50 text-rose-700 ring-rose-200" },
  MARKETING:              { label: "Marketing",             cls: "bg-pink-50 text-pink-700 ring-pink-200" },
  TI:                     { label: "TI",                    cls: "bg-cyan-50 text-cyan-700 ring-cyan-200" },
  RH:                     { label: "RH",                    cls: "bg-teal-50 text-teal-700 ring-teal-200" },
  COMERCIAL:              { label: "Comercial",             cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  EXPEDICAO:              { label: "Expedição",             cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  POS_VENDAS:             { label: "Pós-Vendas",            cls: "bg-lime-50 text-lime-700 ring-lime-200" },
  SECRETARIA_ASSISTENCIA: { label: "Secretária Assistência", cls: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200" },
  TECNICOS_ASSISTENCIA:   { label: "Técnicos Assistência",  cls: "bg-slate-100 text-slate-700 ring-slate-200" },
}

// Departamentos exibidos nos dropdowns (ordem curada)
const DEPT_OPTIONS = [
  "VENDAS", "SUPORTE", "FINANCEIRO", "EXPEDICAO", "POS_VENDAS",
  "SECRETARIA_ASSISTENCIA", "TECNICOS_ASSISTENCIA", "GERENCIA",
] as const

// ─── Sub-components ────────────────────────────────────────────────────────────

function Badge({ cfg }: Readonly<{ cfg: { label: string; cls: string } }>) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function Field({
  id, label, type = "text", required, value, onChange, placeholder, children,
}: Readonly<{
  id: string; label: string; type?: string; required?: boolean
  value?: string; onChange?: (v: string) => void; placeholder?: string
  children?: React.ReactNode
}>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {label}
      </label>
      {children ?? (
        <input
          id={id} type={type} required={required} value={value}
          onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-all focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-900/5"
        />
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: "", email: "", password: "", role: "AGENT" as const, department: "VENDAS" as const }

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers]     = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError]   = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [toggling, setToggling]     = useState<string | null>(null)
  const [csvAgent,  setCsvAgent]    = useState<UserRow | null>(null)
  const [csvResult, setCsvResult]   = useState<{ total: number; created: number; updated: number; skipped: number; agentName: string } | null>(null)
  const [csvError,  setCsvError]    = useState<string | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const csvFileRef = useRef<HTMLInputElement>(null)

  // ─── Edit user state ────────────────────────────────────────────────────────
  const [editUser,      setEditUser]      = useState<UserRow | null>(null)
  const [editForm,      setEditForm]      = useState<{ name: string; email: string; password: string; role: "ADMIN" | "AGENT"; department: string | null }>({ name: "", email: "", password: "", role: "AGENT", department: "VENDAS" })
  const [editError,     setEditError]     = useState<string | null>(null)
  const [editSubmitting,setEditSubmitting] = useState(false)
  const [exporting,     setExporting]     = useState<string | null>(null)
  const [deleteUser,    setDeleteUser]    = useState<UserRow | null>(null)
  const [deleteError,   setDeleteError]   = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)

  const patchForm = (patch: Partial<typeof EMPTY_FORM>) => setForm((f) => ({ ...f, ...patch }))
  const patchEdit = (patch: Partial<typeof editForm>)  => setEditForm((f) => ({ ...f, ...patch }))

  // ─── Data fetching ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/users")
    if (res.status === 403) { router.push("/admin/dashboard"); return }
    setUsers((await res.json()) as UserRow[])
    setLoading(false)
  }, [router])

  useEffect(() => { void load() }, [load])

  // ─── Create user ────────────────────────────────────────────────────────────

  const handleCreate = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = (await res.json()) as UserRow & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar usuário")
      setUsers((prev) => [...prev, data])
      setShowModal(false)
      setForm(EMPTY_FORM)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Toggle isActive (optimistic) ──────────────────────────────────────────

  const handleToggle = async (id: string) => {
    setToggling(id)
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isActive: !u.isActive } : u))
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "PATCH" })
      if (!res.ok) {
        setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isActive: !u.isActive } : u))
      }
    } catch {
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isActive: !u.isActive } : u))
    } finally {
      setToggling(null)
    }
  }

  // ─── Edit user ─────────────────────────────────────────────────────────────────

  const openEdit = (u: UserRow) => {
    setEditUser(u)
    setEditForm({ name: u.name, email: u.email, password: "", role: u.role, department: u.department ?? "VENDAS" })
    setEditError(null)
  }

  const handleEdit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    if (!editUser) return
    setEditError(null)
    setEditSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
        department: editForm.department,
      }
      if (editForm.password) body.password = editForm.password
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as UserRow & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar")
      setUsers((prev) => prev.map((u) => u.id === editUser.id ? { ...u, ...data } : u))
      setEditUser(null)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setEditSubmitting(false)
    }
  }

  // ─── Delete user ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteUser) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, { method: "DELETE" })
      if (res.status === 204) {
        setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id))
        setDeleteUser(null)
      } else {
        const data = await res.json() as { error?: string }
        setDeleteError(data.error ?? "Erro ao excluir")
      }
    } catch {
      setDeleteError("Erro de conexão")
    } finally {
      setDeleting(false)
    }
  }

  // ─── Export contacts ──────────────────────────────────────────────────────────

  const handleExport = async (u: UserRow) => {
    if (exporting) return
    setExporting(u.id)
    try {
      const res = await fetch(`/api/admin/contacts/export?userId=${u.id}`)
      if (!res.ok) { alert("Erro ao exportar contatos"); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      a.download = `contatos_${u.name.replace(/\s+/g, "_")}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(null)
    }
  }

  // ─── CSV import ────────────────────────────────────────────────────────────────

  const handleCsvImport = async () => {
    const file = csvFileRef.current?.files?.[0]
    if (!file || !csvAgent || csvImporting) return
    setCsvImporting(true)
    setCsvError(null)
    setCsvResult(null)
    try {
      const fd = new FormData()
      fd.append("file",   file)
      fd.append("userId", csvAgent.id)
      const res = await fetch("/api/admin/contacts/import", { method: "POST", body: fd })
      const data = await res.json() as typeof csvResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro na importação")
      setCsvResult(data)
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setCsvImporting(false)
    }
  }

  const closeCsvModal = () => {
    setCsvAgent(null)
    setCsvResult(null)
    setCsvError(null)
    if (csvFileRef.current) csvFileRef.current.value = ""
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const total    = users.length
  const active   = users.filter((u) => u.isActive).length
  const inactive = total - active

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#f4f5f7] font-sans">

      {/* ── Page header ── */}
      <header className="border-b border-zinc-200 bg-white px-4 py-5 md:px-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/admin/dashboard")}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd"/>
              </svg>
            </button>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Equipe</h1>
              <p className="text-xs text-zinc-400">Gerencie os usuários e acessos do sistema</p>
            </div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700 active:scale-[0.97]"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
            </svg>
            Novo Usuário
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-8">

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total",    value: total,    color: "text-zinc-900" },
            { label: "Ativos",   value: active,   color: "text-emerald-600" },
            { label: "Inativos", value: inactive, color: "text-zinc-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-2xl border border-zinc-100 bg-white px-6 py-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</p>
              <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto rounded-2xl border border-zinc-100 bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-zinc-400">
              <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Carregando equipe...
            </div>
          ) : users.length === 0 ? (
            <div className="py-20 text-center text-sm text-zinc-400">
              Nenhum usuário cadastrado.
              <button onClick={() => setShowModal(true)} className="ml-1 underline underline-offset-2 hover:text-zinc-600">
                Criar o primeiro.
              </button>
            </div>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Nome</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-400">E-mail</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Departamento</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Perfil</th>
                  <th className="px-6 py-3.5 text-left text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Status</th>
                  <th className="px-6 py-3.5 text-right text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {users.map((u) => (
                  <tr key={u.id} className={`transition-colors hover:bg-zinc-50/70 ${!u.isActive ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-zinc-800">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-500">{u.email}</td>
                    <td className="px-6 py-4">
                      {u.department
                        ? <Badge cfg={DEPT_CFG[u.department]} />
                        : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="px-6 py-4"><Badge cfg={ROLE_CFG[u.role]} /></td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${u.isActive ? "text-emerald-600" : "text-zinc-400"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? "bg-emerald-500" : "bg-zinc-300"}`} />
                        {u.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        {/* Editar */}
                        <button onClick={() => openEdit(u)} title="Editar"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" />
                          </svg>
                        </button>
                        {/* Excluir */}
                        <button onClick={() => { setDeleteUser(u); setDeleteError(null) }} title="Excluir"
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500">
                          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12M6 4V2h4v2M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" />
                          </svg>
                        </button>
                        {/* Importar CSV */}
                        {u.role === "AGENT" && (
                          <button onClick={() => { setCsvAgent(u); setCsvResult(null); setCsvError(null) }} title="Importar carteira CSV"
                            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-zinc-500 ring-1 ring-inset ring-zinc-200 transition-all hover:bg-zinc-100 hover:text-zinc-700">
                            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3M8 2v7m-2.5-2.5L8 9l2.5-2.5" />
                            </svg>
                            Imp.
                          </button>
                        )}
                        {/* Exportar CSV */}
                        {u.role === "AGENT" && (
                          <button onClick={() => void handleExport(u)} disabled={exporting === u.id} title="Exportar contatos CSV"
                            className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-zinc-500 ring-1 ring-inset ring-zinc-200 transition-all hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40">
                            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3M8 9V2m0 7l-2.5-2.5M8 9l2.5-2.5" />
                            </svg>
                            {exporting === u.id ? "..." : "Exp."}
                          </button>
                        )}
                        {/* Ativar/Desativar */}
                        <button onClick={() => void handleToggle(u.id)} disabled={toggling === u.id}
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all disabled:opacity-40 ${
                            u.isActive ? "bg-red-50 text-red-500 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          }`}>
                          {toggling === u.id ? "..." : u.isActive ? "Desativar" : "Reativar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Edit User Slide-over ── */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-end justify-end">
          <button type="button" aria-label="Fechar" className="absolute inset-0 w-full cursor-default bg-black/20 backdrop-blur-sm" onClick={() => setEditUser(null)} />
          <div className="relative h-full w-full max-w-md border-l border-zinc-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
              <div>
                <h2 className="text-[15px] font-semibold text-zinc-900">Editar Usuário</h2>
                <p className="mt-0.5 text-xs text-zinc-400">{editUser.email}</p>
              </div>
              <button onClick={() => setEditUser(null)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
              </button>
            </div>
            <form onSubmit={(e) => void handleEdit(e)} className="flex h-[calc(100%-73px)] flex-col">
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                <Field id="e-name"  label="Nome completo" required value={editForm.name}  onChange={(v) => patchEdit({ name: v })} placeholder="Maria da Silva" />
                <Field id="e-email" label="E-mail" type="email" required value={editForm.email} onChange={(v) => patchEdit({ email: v })} placeholder="maria@empresa.com" />
                <Field id="e-pass"  label="Nova senha" type="password" value={editForm.password} onChange={(v) => patchEdit({ password: v })} placeholder="Deixe vazio para não alterar" />
                <Field id="e-dept" label="Departamento">
                  <select id="e-dept" value={editForm.department ?? ""} onChange={(e) => patchEdit({ department: e.target.value })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-all focus:border-zinc-400 focus:bg-white">
                    {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{DEPT_CFG[d].label}</option>)}
                  </select>
                </Field>
                <Field id="e-role" label="Perfil de acesso">
                  <select id="e-role" value={editForm.role} onChange={(e) => patchEdit({ role: e.target.value as typeof editForm.role })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-all focus:border-zinc-400 focus:bg-white">
                    <option value="AGENT">Agente / Vendedora</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </Field>
                {editError && <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600">{editError}</p>}
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
                <button type="button" onClick={() => setEditUser(null)} className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition-all hover:bg-zinc-50">Cancelar</button>
                <button type="submit" disabled={editSubmitting} className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-60">
                  {editSubmitting ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Fechar" className="absolute inset-0 cursor-default bg-black/30 backdrop-blur-sm" onClick={() => setDeleteUser(null)} />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-2xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-500 mb-4">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-[15px] font-semibold text-zinc-900">Excluir usuário?</h3>
            <p className="mt-1 text-sm text-zinc-500">
              <strong className="text-zinc-700">{deleteUser.name}</strong> será removido permanentemente.
              Se possuir mensagens vinculadas, a exclusão será bloqueada — use <em>Desativar</em> nesse caso.
            </p>
            {deleteError && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600">{deleteError}</p>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDeleteUser(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition-all hover:bg-zinc-50">
                Cancelar
              </button>
              <button type="button" onClick={() => void handleDelete()} disabled={deleting}
                className="rounded-xl bg-red-500 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-red-600 disabled:opacity-60">
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {csvAgent && (
        <div className="fixed inset-0 z-50 flex items-end justify-end">
          <button type="button" aria-label="Fechar" className="absolute inset-0 w-full cursor-default bg-black/20 backdrop-blur-sm" onClick={closeCsvModal} />
          <div className="relative h-auto w-full max-w-md border-l border-zinc-100 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
              <div>
                <h2 className="text-[15px] font-semibold text-zinc-900">Importar Carteira</h2>
                <p className="mt-0.5 text-xs text-zinc-400">Agente: <strong>{csvAgent.name}</strong></p>
              </div>
              <button onClick={closeCsvModal} className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:text-zinc-600">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-4 text-[12px] text-zinc-500">
                <p className="font-semibold text-zinc-700 mb-1">Formato esperado do CSV</p>
                <p>Colunas obrigatórias: <code className="bg-white px-1 rounded">nome</code> e <code className="bg-white px-1 rounded">telefone</code></p>
                <p className="mt-1 text-zinc-400">Exportado do Google Contacts · Google Sheets · Excel</p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-zinc-500" htmlFor="csv-file">Arquivo CSV</label>
                <input
                  id="csv-file" ref={csvFileRef} type="file" accept=".csv,text/csv"
                  className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1 file:text-[11px] file:font-semibold file:text-white file:cursor-pointer"
                />
              </div>
              {csvResult && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-700">
                  <p className="font-semibold">✓ Importação concluída para {csvResult.agentName}</p>
                  <p className="mt-1">Total: {csvResult.total} · Novos: {csvResult.created} · Atualizados: {csvResult.updated} · Ignorados: {csvResult.skipped}</p>
                </div>
              )}
              {csvError && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600">{csvError}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
              <button type="button" onClick={closeCsvModal} className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition-all hover:bg-zinc-50">Fechar</button>
              <button
                type="button"
                onClick={() => void handleCsvImport()}
                disabled={csvImporting}
                className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-60"
              >
                {csvImporting ? "Importando..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal / Slide-over ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-end">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Fechar painel"
            className="absolute inset-0 w-full cursor-default bg-black/20 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />

          {/* Panel */}
          <div className="relative h-full w-full max-w-md border-l border-zinc-100 bg-white shadow-2xl">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">
              <div>
                <h2 className="text-[15px] font-semibold text-zinc-900">Novo Usuário</h2>
                <p className="mt-0.5 text-xs text-zinc-400">Preencha os dados do novo membro da equipe</p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-400 transition-colors hover:border-zinc-300 hover:text-zinc-600"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={(e) => void handleCreate(e)}
              className="flex h-[calc(100%-73px)] flex-col"
            >
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                <Field id="f-name" label="Nome completo" required value={form.name} onChange={(v) => patchForm({ name: v })} placeholder="Maria da Silva" />
                <Field id="f-email" label="E-mail" type="email" required value={form.email} onChange={(v) => patchForm({ email: v })} placeholder="maria@empresa.com" />
                <Field id="f-password" label="Senha" type="password" required value={form.password} onChange={(v) => patchForm({ password: v })} placeholder="mín. 6 caracteres" />

                <Field id="f-dept" label="Departamento">
                  <select
                    id="f-dept"
                    value={form.department}
                    onChange={(e) => patchForm({ department: e.target.value as typeof form.department })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-all focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-900/5"
                  >
                    {DEPT_OPTIONS.map((d) => <option key={d} value={d}>{DEPT_CFG[d].label}</option>)}
                  </select>
                </Field>

                <Field id="f-role" label="Perfil de acesso">
                  <select
                    id="f-role"
                    value={form.role}
                    onChange={(e) => patchForm({ role: e.target.value as typeof form.role })}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition-all focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-900/5"
                  >
                    <option value="AGENT">Agente / Vendedora</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </Field>

                {formError && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600">{formError}</p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 border-t border-zinc-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition-all hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white transition-all hover:bg-zinc-700 active:scale-[0.97] disabled:opacity-60"
                >
                  {submitting ? "Criando..." : "Criar usuário"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

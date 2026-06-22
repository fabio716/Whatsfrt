"use client"

import { useEffect, useState, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────

type UraOption = { id: string; digit: string; label: string; targetDepartment: string; order: number }

type BizHour = {
  dayOfWeek: number; isClosed: boolean
  openTime: string; closeTime: string
  hasLunchBreak: boolean; lunchStart: string; lunchEnd: string
}

type UraConfig = {
  id: string; greetingText: string; isActive: boolean
  outOfOfficeMessage: string; lunchMessage: string
  options: UraOption[]; businessHours: BizHour[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEPT_OPTIONS: { value: string; label: string }[] = [
  { value: "VENDAS",                 label: "Vendas" },
  { value: "SUPORTE",                label: "Suporte" },
  { value: "FINANCEIRO",             label: "Financeiro" },
  { value: "EXPEDICAO",              label: "Expedição" },
  { value: "POS_VENDAS",             label: "Pós-Vendas" },
  { value: "SECRETARIA_ASSISTENCIA", label: "Secretária Assistência" },
  { value: "TECNICOS_ASSISTENCIA",   label: "Técnicos Assistência" },
  { value: "GERENCIA",               label: "Gerência" },
]
const DAY_NAMES   = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"]

const DEFAULT_HOURS: BizHour[] = [0,1,2,3,4,5,6].map((d) => ({
  dayOfWeek: d, isClosed: d === 0 || d === 6,
  openTime: "08:00", closeTime: "18:00",
  hasLunchBreak: d > 0 && d < 6, lunchStart: "12:00", lunchEnd: "13:00",
}))

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ checked, onChange, green }: Readonly<{ checked: boolean; onChange: () => void; green?: boolean }>) {
  const activeColor = green ? "bg-emerald-500" : "bg-zinc-800"
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? activeColor : "bg-zinc-200"}`}>
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function URAPage() {
  const [config,    setConfig]    = useState<UraConfig | null>(null)
  const [tab,       setTab]       = useState<"menu" | "messages" | "hours">("menu")
  const [saving,    setSaving]    = useState(false)
  const [savingHrs, setSavingHrs] = useState(false)
  const [savedAt,   setSavedAt]   = useState<string | null>(null)
  const [hours,     setHours]     = useState<BizHour[]>(DEFAULT_HOURS)
  const [newOpt,    setNewOpt]    = useState({ digit: "", label: "", targetDepartment: "VENDAS" })
  const [addingOpt, setAddingOpt] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/ura")
    if (res.ok) {
      const data = await res.json() as UraConfig
      setConfig(data)
      setHours(data.businessHours?.length === 7 ? data.businessHours : DEFAULT_HOURS)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async () => {
    if (!config) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/ura", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          greetingText: config.greetingText, isActive: config.isActive,
          outOfOfficeMessage: config.outOfOfficeMessage, lunchMessage: config.lunchMessage,
        }),
      })
      if (res.ok) {
        setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
        setTimeout(() => setSavedAt(null), 3000)
      }
    } finally { setSaving(false) }
  }

  const saveHours = async () => {
    setSavingHrs(true)
    try {
      const res = await fetch("/api/admin/ura/hours", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      })
      if (res.ok) {
        setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
        setTimeout(() => setSavedAt(null), 3000)
      }
    } finally { setSavingHrs(false) }
  }

  const patchHour = (idx: number, patch: Partial<BizHour>) =>
    setHours((prev) => prev.map((h, i) => i === idx ? { ...h, ...patch } : h))

  const addOption = async () => {
    if (!newOpt.digit || !newOpt.label || addingOpt) return
    setAddingOpt(true)
    try {
      const res = await fetch("/api/admin/ura/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newOpt, order: config?.options.length ?? 0 }),
      })
      if (res.ok) {
        const created = await res.json() as UraOption
        setConfig((prev) => prev ? { ...prev, options: [...prev.options, created] } : prev)
        setNewOpt({ digit: "", label: "", targetDepartment: "VENDAS" })
      }
    } finally {
      setAddingOpt(false)
    }
  }

  const deleteOption = async (id: string) => {
    const res = await fetch(`/api/admin/ura/options/${id}`, { method: "DELETE" })
    if (res.ok || res.status === 204) {
      setConfig((prev) => prev ? { ...prev, options: prev.options.filter((o) => o.id !== id) } : prev)
    }
  }

  if (!config) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
    </div>
  )

  const isHoursTab = tab === "hours"

  return (
    <div className="h-full overflow-y-auto bg-zinc-50 p-6">
      <div className="mx-auto max-w-2xl space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">Configurador da URA</h1>
            <p className="mt-0.5 text-[13px] text-zinc-500">Menu interativo + roteamento baseado em horário</p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-[12px] text-emerald-600">✓ Salvo às {savedAt}</span>}
            {isHoursTab ? (
              <button type="button" onClick={() => void saveHours()} disabled={savingHrs}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50">
                {savingHrs ? "Salvando..." : "Salvar Horários"}
              </button>
            ) : (
              <button type="button" onClick={() => void save()} disabled={saving}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar Configuração"}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-zinc-100 bg-white p-1 shadow-sm">
          {(["menu", "messages", "hours"] as const).map((t) => {
            const labels = { menu: "Menu Principal", messages: "Mensagens Automáticas", hours: "Horário de Atendimento" }
            return (
              <button key={t} type="button" onClick={() => setTab(t)}
                className={`flex-1 rounded-lg px-3 py-2 text-[12px] font-semibold transition-colors ${tab === t ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"}`}>
                {labels[t]}
              </button>
            )
          })}
        </div>

        {/* ── Tab: Menu Principal ── */}
        {tab === "menu" && (
          <>
            <div className="flex items-center justify-between rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <div>
                <p className="text-[14px] font-semibold text-zinc-800">URA Ativa</p>
                <p className="text-[12px] text-zinc-400">Quando desativada, mensagens vão direto para triagem humana</p>
              </div>
              <Toggle green checked={config.isActive} onChange={() => setConfig((p) => p ? { ...p, isActive: !p.isActive } : p)} />
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <label className="block text-[13px] font-semibold text-zinc-800" htmlFor="greeting">Mensagem de Boas-vindas</label>
              <p className="mb-3 text-[12px] text-zinc-400">Enviada a novos contatos quando iniciam atendimento</p>
              <textarea id="greeting" rows={5} value={config.greetingText}
                onChange={(e) => setConfig((p) => p ? { ...p, greetingText: e.target.value } : p)}
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-800 outline-none transition-colors focus:border-zinc-300 focus:bg-white" />
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <p className="mb-4 text-[13px] font-semibold text-zinc-800">Opções do Menu</p>
              {config.options.length === 0
                ? <p className="py-4 text-center text-[12px] text-zinc-400">Nenhuma opção cadastrada</p>
                : (
                  <div className="mb-4 space-y-2">
                    {config.options.map((opt) => (
                      <div key={opt.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-[12px] font-bold text-white">{opt.digit}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-zinc-800">{opt.label}</p>
                          <p className="text-[11px] text-zinc-400">{opt.targetDepartment}</p>
                        </div>
                        <button type="button" onClick={() => void deleteOption(opt.id)}
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              <div className="flex items-end gap-2 border-t border-zinc-100 pt-4">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-500" htmlFor="new-digit">Dígito</label>
                  <input id="new-digit" type="text" maxLength={2} value={newOpt.digit}
                    onChange={(e) => setNewOpt((p) => ({ ...p, digit: e.target.value }))} placeholder="3"
                    className="w-14 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-center text-[13px] outline-none focus:border-zinc-300" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-zinc-500" htmlFor="new-label">Rótulo</label>
                  <input id="new-label" type="text" value={newOpt.label}
                    onChange={(e) => setNewOpt((p) => ({ ...p, label: e.target.value }))} placeholder="Ex: Suporte"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] outline-none focus:border-zinc-300" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-zinc-500" htmlFor="new-dept">Departamento</label>
                  <select id="new-dept" value={newOpt.targetDepartment}
                    onChange={(e) => setNewOpt((p) => ({ ...p, targetDepartment: e.target.value }))}
                    className="w-44 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-800 outline-none focus:border-zinc-300">
                    {DEPT_OPTIONS.map((d) => <option key={d.value} value={d.value} className="text-zinc-800">{d.label}</option>)}
                  </select>
                </div>
                <button type="button" onClick={() => void addOption()} disabled={!newOpt.digit || !newOpt.label || addingOpt}
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white transition-colors hover:bg-zinc-700 disabled:opacity-40">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Tab: Mensagens Automáticas ── */}
        {tab === "messages" && (
          <>
            <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <label className="block text-[13px] font-semibold text-zinc-800" htmlFor="oof-msg">Mensagem Fora de Expediente</label>
              <p className="mb-3 text-[12px] text-zinc-400">Enviada fora do horário de atendimento (noite, fins de semana). Inclua link do site ou cupom.</p>
              <textarea id="oof-msg" rows={6} value={config.outOfOfficeMessage}
                onChange={(e) => setConfig((p) => p ? { ...p, outOfOfficeMessage: e.target.value } : p)}
                placeholder="Olá! 😊 Estamos fora do horário de atendimento. Acesse nosso site e aproveite as promoções! 🛍️ www.seusite.com.br"
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-800 outline-none transition-colors focus:border-zinc-300 focus:bg-white" />
            </div>

            <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
              <label className="block text-[13px] font-semibold text-zinc-800" htmlFor="lunch-msg">Mensagem de Pausa para Almoço</label>
              <p className="mb-3 text-[12px] text-zinc-400">Enviada durante o intervalo de almoço configurado. Bom momento para incluir promoção rápida.</p>
              <textarea id="lunch-msg" rows={6} value={config.lunchMessage}
                onChange={(e) => setConfig((p) => p ? { ...p, lunchMessage: e.target.value } : p)}
                placeholder="Estamos em pausa para o almoço 🍽️ Retornamos em breve! Veja nossas ofertas: www.seusite.com.br/ofertas"
                className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-800 outline-none transition-colors focus:border-zinc-300 focus:bg-white" />
            </div>
          </>
        )}

        {/* ── Tab: Horário de Atendimento ── */}
        {tab === "hours" && (
          <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
            <div className="border-b border-zinc-100 px-5 py-4">
              <p className="text-[13px] font-semibold text-zinc-800">Horário de Atendimento</p>
              <p className="text-[12px] text-zinc-400">Fuso horário: America/Sao_Paulo (BRT/BRST)</p>
            </div>
            <div className="divide-y divide-zinc-50">
              {hours.map((h, i) => (
                <div key={h.dayOfWeek} className={`px-5 py-4 transition-colors ${h.isClosed ? "bg-zinc-50/60" : ""}`}>
                  <div className="flex items-center gap-4">
                    <span className={`w-32 text-[13px] font-medium ${h.isClosed ? "text-zinc-400" : "text-zinc-800"}`}>
                      {DAY_NAMES[h.dayOfWeek]}
                    </span>
                    <div className="flex items-center gap-2">
                      <Toggle checked={!h.isClosed} onChange={() => patchHour(i, { isClosed: !h.isClosed })} />
                      <span className={`text-[12px] font-medium ${h.isClosed ? "text-zinc-400" : "text-emerald-600"}`}>
                        {h.isClosed ? "Fechado" : "Aberto"}
                      </span>
                    </div>
                    {!h.isClosed && (
                      <div className="ml-auto flex items-center gap-2">
                        <input type="time" value={h.openTime} onChange={(e) => patchHour(i, { openTime: e.target.value })}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-zinc-400" />
                        <span className="text-zinc-300">—</span>
                        <input type="time" value={h.closeTime} onChange={(e) => patchHour(i, { closeTime: e.target.value })}
                          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-zinc-400" />
                      </div>
                    )}
                  </div>
                  {!h.isClosed && (
                    <div className="mt-3 flex items-center gap-4 pl-36">
                      <div className="flex items-center gap-2">
                        <Toggle checked={h.hasLunchBreak} onChange={() => patchHour(i, { hasLunchBreak: !h.hasLunchBreak })} />
                        <span className="text-[12px] text-zinc-500">Pausa almoço</span>
                      </div>
                      {h.hasLunchBreak && (
                        <div className="ml-auto flex items-center gap-2">
                          <input type="time" value={h.lunchStart} onChange={(e) => patchHour(i, { lunchStart: e.target.value })}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-zinc-400" />
                          <span className="text-zinc-300">—</span>
                          <input type="time" value={h.lunchEnd} onChange={(e) => patchHour(i, { lunchEnd: e.target.value })}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[12px] text-zinc-700 outline-none focus:border-zinc-400" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

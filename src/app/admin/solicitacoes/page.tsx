"use client"

import { useState, useEffect, useCallback } from "react"

interface ReqRow {
  id: string
  contactId: string
  contactName: string
  fromUserName: string
  requesterName: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  decidedByName: string | null
  createdAt: string
}

const STATUS_CFG: Record<ReqRow["status"], { label: string; cls: string }> = {
  PENDING:  { label: "Pendente", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "Aprovada", cls: "bg-emerald-50 text-emerald-700" },
  REJECTED: { label: "Recusada", cls: "bg-red-50 text-red-600" },
}

export default function SolicitacoesPage() {
  const [incoming, setIncoming] = useState<ReqRow[]>([])
  const [outgoing, setOutgoing] = useState<ReqRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/transfer-requests")
    if (res.ok) {
      const data = (await res.json()) as { incoming: ReqRow[]; outgoing: ReqRow[] }
      setIncoming(data.incoming)
      setOutgoing(data.outgoing)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  // Tempo real + polling de segurança.
  useEffect(() => {
    const es = new EventSource("/api/sse")
    es.onmessage = (e) => {
      try {
        const p = JSON.parse(e.data) as { type?: string }
        if (p.type === "transfer_request" || p.type === "transfer_decision") void load()
      } catch { /* ignore */ }
    }
    const t = setInterval(() => void load(), 15000)
    return () => { es.close(); clearInterval(t) }
  }, [load])

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id)
    try {
      const res = await fetch(`/api/transfer-requests/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const d = (await res.json()) as { error?: string }
        alert(d.error ?? "Erro ao decidir")
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Solicitações de atendimento</h1>
          <p className="text-xs text-zinc-400">Aprove ou recuse pedidos para assumir clientes.</p>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-8 py-6">

        {/* Pendentes pra decidir */}
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Para você decidir {incoming.length > 0 && <span className="text-amber-600">({incoming.length})</span>}
          </h2>
          <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
            {loading ? (
              <p className="py-8 text-center text-[12px] text-zinc-400">Carregando…</p>
            ) : incoming.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-zinc-400">Nenhuma solicitação pendente. 🎉</p>
            ) : incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b border-zinc-50 px-5 py-3.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-zinc-800">
                    <b>{r.requesterName}</b> quer assumir <b>{r.contactName}</b>
                  </p>
                  <p className="text-[11px] text-zinc-400">Em atendimento com {r.fromUserName}</p>
                </div>
                <button type="button" onClick={() => void decide(r.id, "reject")} disabled={busy === r.id}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">Recusar</button>
                <button type="button" onClick={() => void decide(r.id, "approve")} disabled={busy === r.id}
                  className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Aprovar</button>
              </div>
            ))}
          </div>
        </section>

        {/* Minhas solicitações */}
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Minhas solicitações</h2>
          <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
            {outgoing.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-zinc-400">Você não fez nenhuma solicitação.</p>
            ) : outgoing.map((r) => {
              const st = STATUS_CFG[r.status]
              return (
                <div key={r.id} className="flex items-center gap-3 border-b border-zinc-50 px-5 py-3.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-zinc-800">Assumir <b>{r.contactName}</b></p>
                    <p className="text-[11px] text-zinc-400">
                      De {r.fromUserName}{r.decidedByName ? ` · decidido por ${r.decidedByName}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}

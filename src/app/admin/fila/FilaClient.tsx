"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

interface QueueItem {
  id: string
  whatsappId: string
  name: string
  profilePhotoUrl: string | null
  chatStatus: "WAITING_AGENT" | "IN_URA"
  waitingAgentSince: string | null
  empresa: string | null
  cidade: string | null
  lastMessage: string | null
  lastMessageAt: string | null
}

interface ApiResponse {
  queue: QueueItem[]
  timestamp: string
}

function fmtWait(iso: string | null, now: number): string {
  if (!iso) return "—"
  const secs = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return `${m}min ${s.toString().padStart(2, "0")}s`
  const h = Math.floor(m / 60)
  return `${h}h ${(m % 60).toString().padStart(2, "0")}min`
}

export default function FilaClient({ userName }: Readonly<{ userName: string }>) {
  const router = useRouter()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [assumindo, setAssumindo] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/queue", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ApiResponse
      setQueue(json.queue)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro")
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const assumir = async (contactId: string): Promise<void> => {
    setAssumindo(contactId)
    try {
      const res = await fetch(`/api/admin/contacts/${contactId}/assign`, { method: "POST" })
      if (!res.ok) {
        const errText = await res.text()
        alert(`Erro ao assumir: ${errText}`)
        setAssumindo(null)
        return
      }
      // Redireciona direto pro chat do cliente que acabou de assumir.
      router.push(`/admin/chats?contact=${contactId}`)
    } catch (err) {
      alert(`Erro de rede: ${err instanceof Error ? err.message : "unknown"}`)
      setAssumindo(null)
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-zinc-50 p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Fila de espera</h1>
        <p className="text-[12px] text-zinc-500">
          Clientes aguardando atendimento. Clique em <b>Assumir</b> pra pegar. Atualiza a cada 5s.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-zinc-600">
          🟠 Aguardando ({queue.length})
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          {queue.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-zinc-400">
              Ninguém esperando. 👌
            </p>
          )}
          {queue.map((q) => {
            const waited = fmtWait(q.waitingAgentSince ?? q.lastMessageAt, now)
            const secsWaited = q.waitingAgentSince
              ? Math.floor((now - new Date(q.waitingAgentSince).getTime()) / 1000)
              : 0
            const late = secsWaited > 10 * 60
            return (
              <div
                key={q.id}
                className="flex items-center gap-3 border-b border-zinc-50 px-4 py-3 last:border-0"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[14px] font-semibold text-emerald-700">
                  {q.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-800">{q.name}</span>
                    {q.chatStatus === "IN_URA" && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        na URA
                      </span>
                    )}
                    {q.empresa && (
                      <span className="text-[11px] text-zinc-400">· {q.empresa}</span>
                    )}
                    {q.cidade && (
                      <span className="text-[11px] text-zinc-400">· {q.cidade}</span>
                    )}
                  </div>
                  {q.lastMessage && (
                    <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                      &ldquo;{q.lastMessage}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`text-[11px] tabular-nums ${late ? "font-semibold text-red-600" : "text-zinc-500"}`}
                  >
                    {waited}
                    {late && " ⚠"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void assumir(q.id)}
                    disabled={assumindo === q.id}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {assumindo === q.id ? "Assumindo…" : "Assumir"}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <p className="mt-4 text-[11px] text-zinc-400">
        Logado como <span className="font-medium text-zinc-500">{userName}</span>.
      </p>
    </div>
  )
}

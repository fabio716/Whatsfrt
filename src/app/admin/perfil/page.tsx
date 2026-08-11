"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Avatar from "@/app/admin/components/Avatar"
import { notificationPermission, requestNotificationPermission, subscribeToPush } from "@/lib/notify"

interface Me {
  id: string
  name: string
  email: string
  role: "ADMIN" | "AGENT"
  department: string | null
  photoUrl: string | null
}

export default function PerfilPage() {
  const [me, setMe] = useState<Me | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">("default")

  const load = useCallback(async () => {
    const res = await fetch("/api/me")
    if (res.ok) setMe((await res.json()) as Me)
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setNotifPerm(notificationPermission()) }, [])

  const handleEnableNotifications = async () => {
    const perm = await requestNotificationPermission()
    setNotifPerm(perm)
    if (perm === "granted") {
      await subscribeToPush()
      localStorage.removeItem("whatsfrt:notifications-dismissed")
    }
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f || uploading) return
    setUploading(true)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append("file", f)
      const res = await fetch("/api/me/photo", { method: "POST", body: fd })
      const data = (await res.json()) as { photoUrl?: string; error?: string }
      if (!res.ok || !data.photoUrl) throw new Error(data.error ?? "Falha ao enviar")
      setMe((prev) => (prev ? { ...prev, photoUrl: data.photoUrl! } : prev))
      setMsg("✓ Foto atualizada!")
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro ao enviar foto")
    } finally {
      setUploading(false)
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-zinc-50 font-sans">
      <header className="border-b border-zinc-200 bg-white px-6 py-5 md:px-8">
        <div className="mx-auto max-w-lg">
          <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">Meu perfil</h1>
          <p className="text-xs text-zinc-400">Sua foto aparece para a equipe no chat interno.</p>
        </div>
      </header>

      <div className="mx-auto max-w-lg px-6 py-8 md:px-8">
        {!me ? (
          <p className="text-center text-[13px] text-zinc-400">Carregando…</p>
        ) : (
          <div className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center gap-4">
              <Avatar
                name={me.name}
                photoUrl={me.photoUrl}
                size="h-28 w-28"
                fallback="bg-emerald-100 text-emerald-700 text-4xl font-bold"
              />
              <div className="text-center">
                <p className="text-[16px] font-semibold text-zinc-900">{me.name}</p>
                <p className="text-[12px] text-zinc-400">{me.email}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {me.role === "ADMIN" ? "Administrador" : "Vendedor"}{me.department ? ` · ${me.department}` : ""}
                </p>
              </div>

              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFile(e)} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="mt-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-zinc-700 disabled:opacity-60"
              >
                {uploading ? "Enviando…" : me.photoUrl ? "Trocar foto" : "Adicionar foto"}
              </button>
              {msg && <p className="text-[12px] font-medium text-emerald-600">{msg}</p>}
              <p className="text-center text-[11px] text-zinc-400">
                Use uma foto sua (JPG ou PNG). Ela fica visível só internamente, para os colegas.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
          <h2 className="text-[13px] font-semibold text-zinc-900">Notificações</h2>
          <p className="mt-1 text-[12px] text-zinc-400">
            Avisa na hora quando chegar mensagem nova de cliente ou da equipe — funciona até com o navegador fechado.
          </p>

          {notifPerm === "granted" && (
            <p className="mt-4 text-[12px] font-medium text-emerald-600">✓ Notificações ativadas</p>
          )}

          {notifPerm === "default" && (
            <button
              type="button"
              onClick={() => void handleEnableNotifications()}
              className="mt-4 rounded-xl bg-emerald-600 px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-emerald-700"
            >
              Ativar notificações
            </button>
          )}

          {notifPerm === "denied" && (
            <p className="mt-4 text-[12px] text-zinc-500">
              Notificações estão <strong>bloqueadas</strong> no navegador. Pra ativar, clique no ícone de cadeado 🔒
              ao lado do endereço do site e permita &quot;Notificações&quot;, depois recarregue a página.
            </p>
          )}

          {notifPerm === "unsupported" && (
            <p className="mt-4 text-[12px] text-zinc-500">Seu navegador não suporta notificações.</p>
          )}
        </div>
      </div>
    </main>
  )
}

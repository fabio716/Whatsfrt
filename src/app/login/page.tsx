"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Mascote from "@/components/ui/Mascote"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; role?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao entrar")
      router.push(data.role === "AGENT" ? "/admin/chats" : "/admin/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8fa] p-4">
      <div className="w-full max-w-[380px]">

        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <Mascote className="mx-auto mb-3 h-24 w-24 rounded-3xl shadow-lg shadow-emerald-200/60" title="Atendente virtual da FRT" />
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">WhatsFRT</h1>
          <p className="mt-1 text-sm text-zinc-400">Oi! Vamos atender? 👋 Sistema Interno de Mensageria</p>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-xl shadow-zinc-200/40">
          <div className="h-[3px] bg-gradient-to-r from-emerald-500 to-emerald-700" />

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 p-8">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-600 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

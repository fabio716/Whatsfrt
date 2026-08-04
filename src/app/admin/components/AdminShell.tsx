"use client"

import { useState } from "react"
import AdminNav from "./AdminNav"
import EvolutionStatusBanner from "./EvolutionStatusBanner"
import NotificationsPrompt from "./NotificationsPrompt"

type Role = "ADMIN" | "AGENT"

// Casca do painel com suporte a celular: no desktop o menu fica fixo à esquerda;
// no celular vira uma gaveta que abre pelo botão ☰ na barra superior.
export default function AdminShell({
  userRole,
  children,
}: Readonly<{ userRole: Role; children: React.ReactNode }>) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Backdrop (só no celular, quando a gaveta está aberta) */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
        />
      )}

      <AdminNav userRole={userRole} isOpen={menuOpen} onNavigate={() => setMenuOpen(false)} />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Barra superior — só no celular */}
        <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 md:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-white">
                <path d="M12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0012.05 0z" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-zinc-800">WhatsFRT</span>
          </div>
        </div>

        <EvolutionStatusBanner />
        <NotificationsPrompt />
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}

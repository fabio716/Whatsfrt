import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import PainelWidgets from "./components/PainelWidgets"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Visão geral · WhatsFRT",
}

// Painel de cartões: cada pessoa vê os próprios números e organiza os
// cartões arrastando. O recorte por pessoa é feito no servidor
// (/api/dashboard) — a vendedora não recebe o dado das outras nem no JSON.
// Atendimento vive 100% em /admin/chats — fonte única de verdade.
export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")

  return <PainelWidgets nome={session.name} papel={session.role} />
}

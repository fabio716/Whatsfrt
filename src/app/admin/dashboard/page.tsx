import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import HomeClient from "./components/HomeClient"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Visão geral · WhatsFRT",
}

// Antes essa página era a tela principal de atendimento (chat embedded).
// Agora ela é puramente executiva: KPIs + volume + agentes online.
// Atendimento vive 100% em /admin/chats — fonte única de verdade.
export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")

  return <HomeClient userName={session.name} userRole={session.role} />
}

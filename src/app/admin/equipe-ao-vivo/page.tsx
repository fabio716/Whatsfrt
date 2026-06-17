import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import TeamLiveClient from "./components/TeamLiveClient"

export const dynamic = "force-dynamic"

export const metadata = { title: "Equipe ao vivo · WhatsFRT" }

export default async function EquipeAoVivoPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")
  if (session.role !== "ADMIN") redirect("/admin/chats")

  return <TeamLiveClient />
}

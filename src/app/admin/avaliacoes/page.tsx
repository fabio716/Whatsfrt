import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import RatingsClient from "./components/RatingsClient"

export const dynamic = "force-dynamic"

export const metadata = { title: "Avaliações · WhatsFRT" }

export default async function AvaliacoesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")
  if (session.role !== "ADMIN") redirect("/admin/chats")

  return <RatingsClient />
}

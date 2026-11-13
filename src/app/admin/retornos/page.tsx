import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import RetornosDashboard from "./RetornosDashboard"

export const dynamic = "force-dynamic"

export const metadata = { title: "Retornos da equipe · WhatsFRT" }

export default async function RetornosPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")
  if (session.role !== "ADMIN") redirect("/admin/chats")

  return <RetornosDashboard />
}

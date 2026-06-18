import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import ClientesClient from "./components/ClientesClient"

export const dynamic = "force-dynamic"

export const metadata = { title: "Clientes Cadastrados · WhatsFRT" }

export default async function ClientesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")

  return <ClientesClient isAgent={session.role === "AGENT"} />
}

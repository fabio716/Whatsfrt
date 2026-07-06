import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import FilaClient from "./FilaClient"

export const dynamic = "force-dynamic"

export const metadata = { title: "Fila de espera · WhatsFRT" }

export default async function FilaPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")

  return <FilaClient userName={session.name} />
}

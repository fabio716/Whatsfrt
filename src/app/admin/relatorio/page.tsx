import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import RelatorioClient from "./components/RelatorioClient"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Relatório de atendimento · WhatsFRT",
}

// Tela do relatório diário. Só admin: são números de desempenho da equipe
// inteira, e a regra do painel é que vendedora vê só o que é dela.
// O proxy também barra /admin/relatorio pra AGENT — aqui é a segunda tranca,
// pra rota nova nunca nascer aberta por esquecimento na lista do proxy.
export default async function RelatorioPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  if (!session) redirect("/login")
  if (session.role !== "ADMIN") redirect("/admin/chats")

  return <RelatorioClient />
}

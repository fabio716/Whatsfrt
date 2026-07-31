import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import AdminShell from "./components/AdminShell"

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  // Defesa em profundidade: mesmo com proxy.ts ativo, garantir que sem sessão
  // o conteúdo nunca renderiza (e Server Components não executam queries).
  if (!session) {
    redirect("/login")
  }

  return <AdminShell userRole={session.role}>{children}</AdminShell>
}

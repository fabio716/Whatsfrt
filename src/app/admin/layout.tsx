import { cookies } from "next/headers"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"
import AdminNav from "./components/AdminNav"

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null
  const userRole = session?.role ?? "AGENT"

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <AdminNav userRole={userRole} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}

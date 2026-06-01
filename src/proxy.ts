import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { COOKIE_NAME } from "@/lib/auth"

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me-32chars!!")

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  try {
    await jwtVerify(token, secret())
    return NextResponse.next()
  } catch {
    const response = NextResponse.redirect(new URL("/login", request.url))
    response.cookies.delete(COOKIE_NAME)
    return response
  }
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
}

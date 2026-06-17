import { NextRequest, NextResponse } from "next/server"
import { requireSession, isErrorResponse } from "@/lib/auth"
import { getConnectionState, activeProvider } from "@/lib/whatsapp"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await requireSession(request)
  if (isErrorResponse(auth)) return auth

  const state = await getConnectionState()
  return NextResponse.json({
    provider: activeProvider(),
    instance: { state },
  })
}

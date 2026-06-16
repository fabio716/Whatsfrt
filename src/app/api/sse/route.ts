import { cookies } from "next/headers"
import { addSSEClient, removeSSEClient } from "@/lib/sse-emitter"
import { verifySessionToken, COOKIE_NAME } from "@/lib/auth"

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const HEARTBEAT_INTERVAL_MS = 25_000

export async function GET(): Promise<Response> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const session = token ? await verifySessionToken(token) : null

  // Sem sessão: 401. Antes, anônimos recebiam eventos de contatos com
  // assignedUserId=null (null === null no filtro do broadcaster).
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const userId = session.id
  const role = session.role

  let savedCtrl: ReadableStreamDefaultController<string> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<string>({
    start(ctrl) {
      savedCtrl = ctrl
      addSSEClient(ctrl, userId, role)

      ctrl.enqueue(": connected\n\n")

      heartbeat = setInterval(() => {
        try {
          ctrl.enqueue(": heartbeat\n\n")
        } catch {
          if (heartbeat) clearInterval(heartbeat)
          removeSSEClient(ctrl)
        }
      }, HEARTBEAT_INTERVAL_MS)
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat)
      if (savedCtrl) {
        removeSSEClient(savedCtrl)
        savedCtrl = null
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

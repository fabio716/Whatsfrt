import { addSSEClient, removeSSEClient } from "@/lib/sse-emitter"

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const HEARTBEAT_INTERVAL_MS = 25_000

export async function GET(): Promise<Response> {
  let savedCtrl: ReadableStreamDefaultController<string> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<string>({
    start(ctrl) {
      savedCtrl = ctrl
      addSSEClient(ctrl)

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

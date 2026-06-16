// Handler que o worker chama para cada job da fila inbound.
// Mantém a importação fora do bootstrap para evitar import cycle.

import { handleInboundForUra } from "@/lib/ura/inbound"
import type { InboundJob } from "./queue"

export async function handleInboundJob(job: InboundJob): Promise<void> {
  // O webhook já fez dedupe via Message.whatsappKeyId @unique antes de
  // enfileirar — então aqui podemos processar a URA sem risco de duplicar
  // mensagens de saída.
  await handleInboundForUra(job.whatsappId, job.messageText)
}

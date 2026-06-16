-- Idempotência inbound: key.id da Evolution. Evita duplicar mensagem se a
-- Evolution reenviar o webhook (timeout, restart, etc).
ALTER TABLE "messages" ADD COLUMN     "whatsappKeyId" TEXT;
CREATE UNIQUE INDEX "messages_whatsappKeyId_key" ON "messages"("whatsappKeyId");

-- Idempotência outbound: cliente passa Idempotency-Key no header.
ALTER TABLE "messages" ADD COLUMN     "clientKey" TEXT;
CREATE UNIQUE INDEX "messages_clientKey_key" ON "messages"("clientKey");

-- Diagnóstico: mensagem de erro persistida e contagem de tentativas.
ALTER TABLE "messages" ADD COLUMN     "errorMsg" TEXT;
ALTER TABLE "messages" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

-- Índice para o reaper varrer rápido por (status, createdAt).
CREATE INDEX "messages_status_createdAt_idx" ON "messages"("status", "createdAt");

-- Marca as mensagens que saíram de transmissão (campanha).
ALTER TABLE "messages" ADD COLUMN "isBroadcast" BOOLEAN NOT NULL DEFAULT false;

-- Backfill do histórico: a campanha já guardava o id da mensagem enviada em
-- campaign_logs.messageKeyId, então dá pra recuperar quais foram sem
-- adivinhação.
UPDATE "messages" m
SET "isBroadcast" = true
FROM "campaign_logs" cl
WHERE cl."messageKeyId" IS NOT NULL
  AND m."whatsappKeyId" = cl."messageKeyId";

-- O relatório filtra por essa coluna junto com contato e data.
CREATE INDEX IF NOT EXISTS "messages_isBroadcast_idx" ON "messages"("isBroadcast")
  WHERE "isBroadcast" = true;

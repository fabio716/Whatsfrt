-- Resposta em cima de mensagem (igual WhatsApp): snapshot do texto/autor citado.
ALTER TABLE "messages" ADD COLUMN "quotedMsgId" TEXT;
ALTER TABLE "messages" ADD COLUMN "quotedBody" TEXT;
ALTER TABLE "messages" ADD COLUMN "quotedSender" TEXT;

ALTER TABLE "internal_messages" ADD COLUMN "quotedMsgId" TEXT;
ALTER TABLE "internal_messages" ADD COLUMN "quotedBody" TEXT;
ALTER TABLE "internal_messages" ADD COLUMN "quotedSender" TEXT;

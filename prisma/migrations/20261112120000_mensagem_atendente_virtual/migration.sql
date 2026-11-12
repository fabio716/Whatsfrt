-- Marca as mensagens enviadas pelo atendente virtual, pra vendedora distinguir
-- no chat. Só ACRESCENTA uma coluna (padrão false) — nada existente muda.
ALTER TABLE "messages" ADD COLUMN "viaAtendente" BOOLEAN NOT NULL DEFAULT false;

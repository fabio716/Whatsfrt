-- Guarda quem atendeu por último. Ao contrário de assignedUserId, este campo
-- nunca é zerado no encerramento — é o que mantém a conversa encontrável pela
-- agente depois que o contato volta ao pool.
ALTER TABLE "contacts" ADD COLUMN "lastAgentUserId" TEXT;

CREATE INDEX "contacts_lastAgentUserId_idx" ON "contacts"("lastAgentUserId");

-- Backfill 1: quem está atendendo agora já é o último agente.
UPDATE "contacts"
SET "lastAgentUserId" = "assignedUserId"
WHERE "assignedUserId" IS NOT NULL;

-- Backfill 2: para os já encerrados, recupera o agente do último atendimento
-- registrado em service_sessions. É isso que devolve à Joana as conversas que
-- ela atendeu e "sumiram" — inclusive a de 3 dias atrás.
UPDATE "contacts" c
SET "lastAgentUserId" = s."agentId"
FROM (
  SELECT DISTINCT ON ("contactId") "contactId", "agentId"
  FROM "service_sessions"
  ORDER BY "contactId", "startedAt" DESC
) s
WHERE c."id" = s."contactId"
  AND c."lastAgentUserId" IS NULL;

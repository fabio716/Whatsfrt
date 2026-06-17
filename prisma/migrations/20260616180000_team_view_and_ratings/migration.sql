-- Novo status: cliente aguardando responder a nota
ALTER TYPE "ChatStatus" ADD VALUE IF NOT EXISTS 'AWAITING_RATING';

-- Timestamps de transição para a tela "Equipe ao vivo"
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "waitingAgentSince" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "inServiceSince" TIMESTAMP(3);

-- Backfill: para contatos já em IN_SERVICE, assume que entraram agora
UPDATE "contacts"
SET "inServiceSince" = NOW()
WHERE "chatStatus" = 'IN_SERVICE' AND "inServiceSince" IS NULL;

UPDATE "contacts"
SET "waitingAgentSince" = NOW()
WHERE "chatStatus" = 'WAITING_AGENT' AND "waitingAgentSince" IS NULL;

CREATE INDEX IF NOT EXISTS "contacts_chatStatus_idx" ON "contacts"("chatStatus");

-- Sessões de atendimento (histórico + avaliação)
CREATE TABLE IF NOT EXISTS "service_sessions" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "waitingFrom" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "ratingRequestedAt" TIMESTAMP(3),
  "rating" INTEGER,
  "comment" TEXT,
  "ratedAt" TIMESTAMP(3),
  "autoEnded" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "service_sessions_agentId_startedAt_idx" ON "service_sessions"("agentId", "startedAt");
CREATE INDEX IF NOT EXISTS "service_sessions_contactId_idx" ON "service_sessions"("contactId");
CREATE INDEX IF NOT EXISTS "service_sessions_endedAt_rating_idx" ON "service_sessions"("endedAt", "rating");

ALTER TABLE "service_sessions"
  ADD CONSTRAINT "service_sessions_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_sessions"
  ADD CONSTRAINT "service_sessions_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ordem dos cartões do painel por pessoa (vazio = ordem padrão do papel dela).
ALTER TABLE "users" ADD COLUMN "dashboardLayout" TEXT NOT NULL DEFAULT '';

-- Índices para as consultas do painel. Sem eles, "mensagens de hoje" e
-- "clientes esperando resposta" varreriam a tabela de mensagens inteira a
-- cada 60 segundos, por aba aberta.
CREATE INDEX IF NOT EXISTS "messages_contactId_createdAt_idx"
  ON "messages"("contactId", "createdAt");

CREATE INDEX IF NOT EXISTS "messages_agentId_createdAt_idx"
  ON "messages"("agentId", "createdAt");

CREATE INDEX IF NOT EXISTS "service_sessions_startedAt_idx"
  ON "service_sessions"("startedAt");

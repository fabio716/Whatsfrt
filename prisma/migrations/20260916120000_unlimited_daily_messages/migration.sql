-- Limite diário de mensagens: padrão passa a 0 (ilimitado) e os usuários
-- existentes que estavam no teto antigo de 150 são liberados.
ALTER TABLE "users" ALTER COLUMN "dailyMessageLimit" SET DEFAULT 0;
UPDATE "users" SET "dailyMessageLimit" = 0 WHERE "dailyMessageLimit" = 150;

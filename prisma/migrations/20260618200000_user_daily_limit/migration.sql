-- Limite diário de mensagens iniciadas por agente (anti-spam WhatsApp)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dailyMessageLimit" INTEGER NOT NULL DEFAULT 150;

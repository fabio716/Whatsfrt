-- "Apagar conversa" no chat interno (por usuário, igual WhatsApp).
ALTER TABLE "internal_conversation_members" ADD COLUMN IF NOT EXISTS "clearedAt" TIMESTAMP(3);

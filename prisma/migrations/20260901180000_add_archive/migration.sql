-- Arquivar conversas (igual WhatsApp), por usuário.
ALTER TABLE "internal_conversation_members" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE TABLE "chat_archives" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_archives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chat_archives_userId_contactId_key" ON "chat_archives"("userId", "contactId");
CREATE INDEX "chat_archives_userId_idx" ON "chat_archives"("userId");

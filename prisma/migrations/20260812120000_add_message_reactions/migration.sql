-- AlterTable
ALTER TABLE "messages" ADD COLUMN "myReaction" TEXT;
ALTER TABLE "messages" ADD COLUMN "theirReaction" TEXT;

-- CreateTable
CREATE TABLE "internal_message_reactions" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_message_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_message_reactions_messageId_userId_key" ON "internal_message_reactions"("messageId", "userId");

-- CreateIndex
CREATE INDEX "internal_message_reactions_messageId_idx" ON "internal_message_reactions"("messageId");

-- AddForeignKey
ALTER TABLE "internal_message_reactions" ADD CONSTRAINT "internal_message_reactions_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "internal_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

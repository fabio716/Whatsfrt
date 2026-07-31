-- CreateTable
CREATE TABLE "internal_conversations" (
    "id" TEXT NOT NULL,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_conversation_members" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_conversation_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "internal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "internal_conversations_updatedAt_idx" ON "internal_conversations"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "internal_conversation_members_conversationId_userId_key" ON "internal_conversation_members"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "internal_conversation_members_userId_idx" ON "internal_conversation_members"("userId");

-- CreateIndex
CREATE INDEX "internal_messages_conversationId_createdAt_idx" ON "internal_messages"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "internal_conversation_members" ADD CONSTRAINT "internal_conversation_members_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "internal_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "internal_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

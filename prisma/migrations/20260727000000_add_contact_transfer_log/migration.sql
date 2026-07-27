-- CreateTable
CREATE TABLE "contact_transfer_logs" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "fromUserId" TEXT,
    "fromUserName" TEXT,
    "toUserId" TEXT NOT NULL,
    "toUserName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_transfer_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_transfer_logs_contactId_idx" ON "contact_transfer_logs"("contactId");

-- CreateIndex
CREATE INDEX "contact_transfer_logs_toUserId_idx" ON "contact_transfer_logs"("toUserId");

-- CreateIndex
CREATE INDEX "contact_transfer_logs_fromUserId_idx" ON "contact_transfer_logs"("fromUserId");

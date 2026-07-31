-- CreateTable
CREATE TABLE "contact_transfer_requests" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "fromUserName" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "contact_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_transfer_requests_status_idx" ON "contact_transfer_requests"("status");

-- CreateIndex
CREATE INDEX "contact_transfer_requests_fromUserId_status_idx" ON "contact_transfer_requests"("fromUserId", "status");

-- CreateIndex
CREATE INDEX "contact_transfer_requests_requesterId_status_idx" ON "contact_transfer_requests"("requesterId", "status");

-- CreateIndex
CREATE INDEX "contact_transfer_requests_contactId_status_idx" ON "contact_transfer_requests"("contactId", "status");

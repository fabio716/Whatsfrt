-- CreateTable
CREATE TABLE "quick_reply_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Geral',
    "order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "audioUrl" TEXT,
    "audioType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_reply_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_reply_templates_category_order_idx" ON "quick_reply_templates"("category", "order");

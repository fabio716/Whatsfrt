-- Histórico de Status (story) publicados pelo sistema.
CREATE TABLE IF NOT EXISTS "status_posts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "status_posts_pkey" PRIMARY KEY ("id")
);

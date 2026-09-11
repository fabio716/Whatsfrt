-- Base de conhecimento do Copiloto (IA).
CREATE TABLE IF NOT EXISTS "ai_knowledge" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "ai_knowledge_pkey" PRIMARY KEY ("id")
);

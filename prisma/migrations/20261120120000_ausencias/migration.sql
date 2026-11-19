-- Ausências (20/11/2026): início, fim, duração e motivo opcional (texto livre). Só ACRESCENTA uma tabela.
CREATE TABLE "ausencias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "fim" TIMESTAMP(3),
    "duracaoMin" INTEGER,
    "autoEncerrada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ausencias_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ausencias_userId_inicio_idx" ON "ausencias"("userId", "inicio");
CREATE INDEX "ausencias_inicio_idx" ON "ausencias"("inicio");

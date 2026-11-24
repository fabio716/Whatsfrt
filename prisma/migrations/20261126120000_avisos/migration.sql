-- Avisos com ciência (26/11/2026). Só ACRESCENTA tabelas.
CREATE TABLE "avisos" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "avisos_createdAt_idx" ON "avisos"("createdAt");

CREATE TABLE "aviso_destinatarios" (
    "id" TEXT NOT NULL,
    "avisoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cienteAt" TIMESTAMP(3),

    CONSTRAINT "aviso_destinatarios_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "aviso_destinatarios_avisoId_userId_key" ON "aviso_destinatarios"("avisoId", "userId");
CREATE INDEX "aviso_destinatarios_userId_cienteAt_idx" ON "aviso_destinatarios"("userId", "cienteAt");
ALTER TABLE "aviso_destinatarios" ADD CONSTRAINT "aviso_destinatarios_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "avisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

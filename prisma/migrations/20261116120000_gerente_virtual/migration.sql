-- Gerente virtual (16/11/2026). Só ACRESCENTA: colunas novas e opcionais em
-- contact_reminders e uma tabela nova. Nada existente é alterado ou apagado.
ALTER TABLE "contact_reminders" ADD COLUMN "canal" TEXT;
ALTER TABLE "contact_reminders" ADD COLUMN "relato" TEXT;
ALTER TABLE "contact_reminders" ADD COLUMN "conferencia" TEXT;
ALTER TABLE "contact_reminders" ADD COLUMN "conferidaEm" TIMESTAMP(3);
ALTER TABLE "contact_reminders" ADD COLUMN "conferidaPorId" TEXT;
ALTER TABLE "contact_reminders" ADD COLUMN "conferenciaNota" TEXT;
CREATE INDEX "contact_reminders_conferencia_idx" ON "contact_reminders"("conferencia");

CREATE TABLE "gerente_ocorrencias" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "userId" TEXT,
    "contactId" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "abertaEm" TIMESTAMP(3) NOT NULL,
    "cienteAt" TIMESTAMP(3),
    "cienteUserId" TEXT,
    "escaladaEm" TIMESTAMP(3),
    "resolvidaEm" TIMESTAMP(3),
    "resolvidaPorId" TEXT,
    "esperaMin" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gerente_ocorrencias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "gerente_ocorrencias_tipo_refId_key" ON "gerente_ocorrencias"("tipo", "refId");
CREATE INDEX "gerente_ocorrencias_userId_resolvidaEm_idx" ON "gerente_ocorrencias"("userId", "resolvidaEm");
CREATE INDEX "gerente_ocorrencias_abertaEm_idx" ON "gerente_ocorrencias"("abertaEm");

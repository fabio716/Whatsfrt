-- Contestação pela pessoa (19/11/2026). Só ACRESCENTA colunas opcionais.
ALTER TABLE "contact_reminders" ADD COLUMN "contestadaEm" TIMESTAMP(3);
ALTER TABLE "contact_reminders" ADD COLUMN "contestacao" TEXT;
ALTER TABLE "gerente_ocorrencias" ADD COLUMN "contestadaEm" TIMESTAMP(3);
ALTER TABLE "gerente_ocorrencias" ADD COLUMN "contestacao" TEXT;

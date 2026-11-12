-- Ciência obrigatória dos retornos (12/11/2026). Só ACRESCENTA uma coluna.
-- escalonadoAt: quando o retorno atrasou e a diretoria foi avisada.
ALTER TABLE "contact_reminders" ADD COLUMN "cienteAt" TIMESTAMP(3);
ALTER TABLE "contact_reminders" ADD COLUMN "escalonadoAt" TIMESTAMP(3);

-- Os lembretes que as próprias vendedoras criaram já nascem "cientes": só os
-- retornos deixados pelo atendente virtual (🤖) passam a pedir o aceite.
UPDATE "contact_reminders" SET "cienteAt" = NOW() WHERE "note" NOT LIKE '🤖%';

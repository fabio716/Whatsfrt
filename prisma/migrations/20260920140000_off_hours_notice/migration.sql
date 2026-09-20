-- Aviso de fora do horário: guarda até quando o contato já foi avisado
-- (o horário da reabertura), pra não repetir a cada mensagem que ele manda.
ALTER TABLE "contacts" ADD COLUMN "offHoursNoticeUntil" TIMESTAMP(3);

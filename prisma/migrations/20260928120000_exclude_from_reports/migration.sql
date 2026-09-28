-- Contato marcado como "não contar no relatório" — usado pra números que são
-- na verdade chatbot de outra empresa (ex: assistente virtual de banco), não
-- cliente de verdade.
ALTER TABLE "contacts" ADD COLUMN "excludeFromReports" BOOLEAN NOT NULL DEFAULT false;

-- Tarefas: a pessoa pode propor outro prazo com justificativa (23/11/2026). Só ACRESCENTA colunas.
ALTER TABLE "tarefas" ADD COLUMN "prazoProposto" TIMESTAMP(3),
ADD COLUMN "justificativa" TEXT,
ADD COLUMN "propostaEm" TIMESTAMP(3),
ADD COLUMN "propostaStatus" TEXT,
ADD COLUMN "decididaEm" TIMESTAMP(3),
ADD COLUMN "notaDecisao" TEXT;

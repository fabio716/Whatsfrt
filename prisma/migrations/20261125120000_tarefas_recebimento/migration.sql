-- Tarefas: administrador confirma o recebimento do feedback (25/11/2026). Só ACRESCENTA colunas.
ALTER TABLE "tarefas" ADD COLUMN "recebidaEm" TIMESTAMP(3),
ADD COLUMN "recebidaPorId" TEXT,
ADD COLUMN "notaRecebimento" TEXT;

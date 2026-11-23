-- Tarefas com feedback obrigatório (23/11/2026). Só ACRESCENTA uma tabela.
CREATE TABLE "tarefas" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhes" TEXT,
    "criadaPorId" TEXT NOT NULL,
    "paraUserId" TEXT NOT NULL,
    "prazoEm" TIMESTAMP(3) NOT NULL,
    "cienteAt" TIMESTAMP(3),
    "concluidaAt" TIMESTAMP(3),
    "feedback" TEXT,
    "avisadaAt" TIMESTAMP(3),
    "escaladaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tarefas_paraUserId_concluidaAt_idx" ON "tarefas"("paraUserId", "concluidaAt");
CREATE INDEX "tarefas_concluidaAt_prazoEm_idx" ON "tarefas"("concluidaAt", "prazoEm");

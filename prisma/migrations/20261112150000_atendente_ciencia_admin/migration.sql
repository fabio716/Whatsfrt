-- Resumo do atendente virtual para o administrador (12/11/2026).
-- Só ACRESCENTA uma tabela: guarda quando cada administrador deu "ciente".
CREATE TABLE "atendente_virtual_ciencia" (
    "userId" TEXT NOT NULL,
    "cienteAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atendente_virtual_ciencia_pkey" PRIMARY KEY ("userId")
);

-- Atendente virtual (11/11/2026). Só ACRESCENTA uma tabela nova — nada
-- existente é alterado ou apagado.
CREATE TABLE "atendente_virtual_config" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "ativoNoite" BOOLEAN NOT NULL DEFAULT true,
    "ativoAlmoco" BOOLEAN NOT NULL DEFAULT true,
    "numerosTeste" TEXT NOT NULL DEFAULT '',
    "ultimoRodizioUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "atendente_virtual_config_pkey" PRIMARY KEY ("id")
);

-- Avisos: pergunta com resposta obrigatória e comentário opcional (28/11/2026). Só ACRESCENTA colunas.
ALTER TABLE "avisos" ADD COLUMN "exigeResposta" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "aviso_destinatarios" ADD COLUMN "resposta" TEXT;

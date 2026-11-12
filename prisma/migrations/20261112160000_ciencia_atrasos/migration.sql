-- "Ciente" do administrador na faixa de retornos atrasados (12/11/2026).
-- Só ACRESCENTA uma coluna e afrouxa a obrigatoriedade de outra.
ALTER TABLE "atendente_virtual_ciencia" ALTER COLUMN "cienteAt" DROP NOT NULL;
ALTER TABLE "atendente_virtual_ciencia" ADD COLUMN "atrasosCienteAt" TIMESTAMP(3);

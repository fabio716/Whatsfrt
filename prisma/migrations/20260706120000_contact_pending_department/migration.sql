-- Departamento alvo escolhido pelo cliente na URA. Populado quando a URA
-- nao consegue auto-atribuir e o contato entra em WAITING_AGENT — permite
-- que a pagina /admin/fila mostre cada contato APENAS pros agentes do
-- setor certo (Vendas nao ve fila do Financeiro etc.).
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "pendingDepartment" TEXT;

CREATE INDEX IF NOT EXISTS "contacts_pendingDepartment_idx"
  ON "contacts" ("pendingDepartment");

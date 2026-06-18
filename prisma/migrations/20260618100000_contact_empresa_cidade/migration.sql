-- Campos comerciais opcionais — busca/filtro em /admin/clientes
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "empresa" TEXT;
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "cidade"  TEXT;

CREATE INDEX IF NOT EXISTS "contacts_empresa_idx" ON "contacts"("empresa");
CREATE INDEX IF NOT EXISTS "contacts_cidade_idx"  ON "contacts"("cidade");

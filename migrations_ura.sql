-- ═══════════════════════════════════════════════════════════════════════════
-- Motor da URA - Migrations SQL
-- Execute este script no PostgreSQL da VPS
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Atualizar UraConfig com novos campos de mensagens
ALTER TABLE ura_config 
ADD COLUMN IF NOT EXISTS "askNameMessage" TEXT DEFAULT 'Por favor, digite seu nome completo:',
ADD COLUMN IF NOT EXISTS "askProfileMessage" TEXT DEFAULT 'Você é:\n1️⃣ Pessoa Física\n2️⃣ Pessoa Jurídica',
ADD COLUMN IF NOT EXISTS "askSectorMessage" TEXT DEFAULT 'Qual setor deseja?\n1️⃣ Financeiro\n2️⃣ Suporte\n3️⃣ Vendas\n0️⃣ Voltar',
ADD COLUMN IF NOT EXISTS "nightAskNameMessage" TEXT DEFAULT 'Obrigado por entrar em contato! Por favor, informe seu nome:',
ADD COLUMN IF NOT EXISTS "nightAskSectorMessage" TEXT DEFAULT 'Qual o setor de interesse?\n1️⃣ Financeiro\n2️⃣ Suporte\n3️⃣ Vendas',
ADD COLUMN IF NOT EXISTS "nightAskSubjectMessage" TEXT DEFAULT 'Por favor, descreva brevemente o assunto:';

-- 2. Criar tabela UraSession
CREATE TABLE IF NOT EXISTS ura_sessions (
  id TEXT PRIMARY KEY,
  "whatsappId" TEXT UNIQUE NOT NULL,
  "currentNode" TEXT NOT NULL,
  "previousNode" TEXT,
  "isNightFlow" BOOLEAN DEFAULT false NOT NULL,
  "collectedName" TEXT,
  "collectedProfile" TEXT,
  "collectedSector" TEXT,
  "collectedSubject" TEXT,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "ura_sessions_whatsappId_idx" ON ura_sessions("whatsappId");
CREATE INDEX IF NOT EXISTS "ura_sessions_expiresAt_idx" ON ura_sessions("expiresAt");

-- 3. Criar tabela Cooperatives
CREATE TABLE IF NOT EXISTS cooperatives (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  "cnpjBase" TEXT,
  "isActive" BOOLEAN DEFAULT true NOT NULL,
  "assignedUserId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Criar tabela Territories
CREATE TABLE IF NOT EXISTS territories (
  id TEXT PRIMARY KEY,
  uf TEXT UNIQUE NOT NULL,
  "isActive" BOOLEAN DEFAULT true NOT NULL,
  "assignedUserIds" TEXT[] DEFAULT '{}' NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. Criar tabela NightOffer
CREATE TABLE IF NOT EXISTS night_offers (
  id TEXT PRIMARY KEY,
  "isActive" BOOLEAN DEFAULT false NOT NULL,
  "couponCode" TEXT DEFAULT '' NOT NULL,
  "discountType" TEXT DEFAULT 'percentage' NOT NULL,
  "discountValue" DOUBLE PRECISION DEFAULT 0 NOT NULL,
  "storeUrl" TEXT DEFAULT '' NOT NULL,
  "offerMessage" TEXT DEFAULT '🎁 Oferta especial! Use o cupom {coupon} e ganhe {discount} de desconto!\n\nAcesse: {url}' NOT NULL,
  "configId" TEXT UNIQUE NOT NULL REFERENCES ura_config(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 6. Inserir dados iniciais (se não existirem)

-- Cooperativas exemplo
INSERT INTO cooperatives (id, name, "cnpjBase", "isActive")
SELECT 'coop_sicoob', 'Sicoob', '02038232', true
WHERE NOT EXISTS (SELECT 1 FROM cooperatives WHERE name = 'Sicoob');

INSERT INTO cooperatives (id, name, "cnpjBase", "isActive")
SELECT 'coop_sicredi', 'Sicredi', '01181521', true
WHERE NOT EXISTS (SELECT 1 FROM cooperatives WHERE name = 'Sicredi');

INSERT INTO cooperatives (id, name, "cnpjBase", "isActive")
SELECT 'coop_cresol', 'Cresol', '00402616', true
WHERE NOT EXISTS (SELECT 1 FROM cooperatives WHERE name = 'Cresol');

-- Territórios exemplo (SP, RJ, MG)
INSERT INTO territories (id, uf, "isActive", "assignedUserIds")
SELECT 'terr_sp', 'SP', true, '{}'
WHERE NOT EXISTS (SELECT 1 FROM territories WHERE uf = 'SP');

INSERT INTO territories (id, uf, "isActive", "assignedUserIds")
SELECT 'terr_rj', 'RJ', true, '{}'
WHERE NOT EXISTS (SELECT 1 FROM territories WHERE uf = 'RJ');

INSERT INTO territories (id, uf, "isActive", "assignedUserIds")
SELECT 'terr_mg', 'MG', true, '{}'
WHERE NOT EXISTS (SELECT 1 FROM territories WHERE uf = 'MG');

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM DAS MIGRATIONS
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'Migrations aplicadas com sucesso!' AS status;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: Resetar status dos contatos importados
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Resetar todos os contatos para IDLE (exceto os que estão em atendimento ativo)
UPDATE contacts 
SET "chatStatus" = 'IDLE'
WHERE "chatStatus" != 'IN_SERVICE';

-- 2. Limpar atribuições de contatos sem mensagens recentes (últimas 24h)
UPDATE contacts 
SET "assignedUserId" = NULL,
    "chatStatus" = 'IDLE'
WHERE "assignedUserId" IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT "contactId" 
    FROM messages 
    WHERE "createdAt" > NOW() - INTERVAL '24 hours'
  );

-- 3. Ver estatísticas
SELECT 
  "chatStatus",
  COUNT(*) as total
FROM contacts
WHERE "deletedAt" IS NULL
GROUP BY "chatStatus"
ORDER BY total DESC;

SELECT 'Status resetados com sucesso!' AS status;

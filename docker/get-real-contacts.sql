SELECT id, name, "whatsappId" FROM contacts 
WHERE "whatsappId" NOT LIKE '%@lid%' 
  AND "deletedAt" IS NULL 
  AND name != '' 
ORDER BY "createdAt" DESC 
LIMIT 5;

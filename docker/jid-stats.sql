SELECT 
  COUNT(*) FILTER (WHERE "whatsappId" LIKE '%@lid%') AS lid_contacts,
  COUNT(*) FILTER (WHERE "whatsappId" NOT LIKE '%@lid%') AS normal_contacts,
  COUNT(*) AS total
FROM contacts WHERE "deletedAt" IS NULL;

SELECT m.id, m.body, m.direction, m.status, m."createdAt", c.name
FROM messages m
JOIN contacts c ON c.id = m."contactId"
WHERE m."createdAt" > NOW() - INTERVAL '1 hour'
ORDER BY m."createdAt" DESC
LIMIT 10;

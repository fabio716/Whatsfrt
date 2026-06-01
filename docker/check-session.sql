SELECT count(*) as session_rows FROM "Session";
SELECT count(*) as instance_rows FROM "Instance";
SELECT "connectionStatus", "ownerJid" FROM "Instance" LIMIT 3;

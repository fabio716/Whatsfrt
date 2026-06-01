select
  (select count(*) from contacts where "deletedAt" is null) as contacts,
  (select count(*) from messages) as messages,
  (select count(*) from messages where body != '') as with_body;

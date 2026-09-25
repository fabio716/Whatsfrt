-- "Aparece no menu da URA": tira a pessoa da lista que o cliente escolhe sem
-- mexer no setor dela. Todo mundo começa visível, que é o comportamento atual.
ALTER TABLE "users" ADD COLUMN "uraMenuVisible" BOOLEAN NOT NULL DEFAULT true;

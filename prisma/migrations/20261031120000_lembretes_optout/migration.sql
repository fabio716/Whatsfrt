-- Produtividade das vendedoras (31/10/2026). Só ACRESCENTA — nada existente
-- é alterado ou apagado.

-- Cliente pediu pra não receber ofertas ("SAIR", "parar"...). null = recebe.
ALTER TABLE "contacts" ADD COLUMN "optOutAt" TIMESTAMP(3);

-- Lembretes de retorno da vendedora. Não envia nada ao cliente.
CREATE TABLE "contact_reminders" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "doneAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_reminders_userId_doneAt_dueAt_idx" ON "contact_reminders"("userId", "doneAt", "dueAt");
CREATE INDEX "contact_reminders_contactId_idx" ON "contact_reminders"("contactId");

ALTER TABLE "contact_reminders" ADD CONSTRAINT "contact_reminders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_reminders" ADD CONSTRAINT "contact_reminders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

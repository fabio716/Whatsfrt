/**
 * clear-contacts.ts
 * Apaga TODOS os registros de Message, Contact e CampaignLog do banco local.
 * Uso: npx tsx scripts/clear-contacts.ts
 */

import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log("🗑️  Iniciando limpeza do banco local...\n")

  const campaignLogs = await prisma.campaignLog.deleteMany()
  console.log(`  ✓ CampaignLog: ${campaignLogs.count} registros removidos`)

  const messages = await prisma.message.deleteMany()
  console.log(`  ✓ Messages:    ${messages.count} registros removidos`)

  const contacts = await prisma.contact.deleteMany()
  console.log(`  ✓ Contacts:    ${contacts.count} registros removidos`)

  console.log("\n✅  Banco limpo. Pronto para receber o número oficial.")
}

main()
  .catch((e) => { console.error("Erro:", e); process.exit(1) })
  .finally(() => prisma.$disconnect())

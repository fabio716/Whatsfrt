/**
 * Cria o primeiro usuário ADMIN no banco de dados.
 * Uso: npx tsx scripts/create-admin.ts <email> <senha> [nome]
 *
 * Exemplo:
 *   npx tsx scripts/create-admin.ts admin@empresa.com MinhaSenh@123 "Admin Master"
 */

import "dotenv/config"
import bcrypt from "bcryptjs"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const [, , email, password, name = "Administrador"] = process.argv

  if (!email || !password) {
    console.error("Uso: npx tsx scripts/create-admin.ts <email> <senha> [nome]")
    process.exit(1)
  }

  const exists = await prisma.user.findFirst({ where: { email: email.toLowerCase() } })
  if (exists) {
    console.error(`Usuário com e-mail "${email}" já existe.`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), passwordHash, role: "ADMIN" },
  })

  console.log(`✅ Admin criado com sucesso!`)
  console.log(`   ID:    ${user.id}`)
  console.log(`   Nome:  ${user.name}`)
  console.log(`   Email: ${user.email}`)
  console.log(`   Role:  ${user.role}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => void prisma.$disconnect())

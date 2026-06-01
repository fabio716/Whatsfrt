/*
  Warnings:

  - The values [AGENTE] on the enum `Role` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `deletedAt` on the `users` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "Department" AS ENUM ('VENDAS', 'FINANCEIRO', 'GERENCIA');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('ADMIN', 'AGENT');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'AGENT';
COMMIT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "deletedAt",
ADD COLUMN     "department" "Department",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "role" SET DEFAULT 'AGENT';

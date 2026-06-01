-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('IDLE', 'IN_URA', 'WAITING_AGENT', 'IN_SERVICE');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "chatStatus" "ChatStatus" NOT NULL DEFAULT 'IDLE';

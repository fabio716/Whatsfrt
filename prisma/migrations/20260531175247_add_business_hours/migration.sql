-- AlterTable
ALTER TABLE "ura_config" ADD COLUMN     "lunchMessage" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "outOfOfficeMessage" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "business_hours" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT NOT NULL DEFAULT '08:00',
    "closeTime" TEXT NOT NULL DEFAULT '18:00',
    "hasLunchBreak" BOOLEAN NOT NULL DEFAULT false,
    "lunchStart" TEXT NOT NULL DEFAULT '12:00',
    "lunchEnd" TEXT NOT NULL DEFAULT '13:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "configId" TEXT NOT NULL,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_hours_configId_dayOfWeek_key" ON "business_hours"("configId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ura_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

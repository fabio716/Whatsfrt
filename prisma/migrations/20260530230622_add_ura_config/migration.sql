-- CreateTable
CREATE TABLE "ura_config" (
    "id" TEXT NOT NULL,
    "greetingText" TEXT NOT NULL DEFAULT 'Olá! 👋 Como podemos te ajudar?

Responda com o número da opção desejada.',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ura_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ura_menu_options" (
    "id" TEXT NOT NULL,
    "digit" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetDepartment" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "configId" TEXT NOT NULL,

    CONSTRAINT "ura_menu_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ura_menu_options_configId_digit_key" ON "ura_menu_options"("configId", "digit");

-- AddForeignKey
ALTER TABLE "ura_menu_options" ADD CONSTRAINT "ura_menu_options_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ura_config"("id") ON DELETE CASCADE ON UPDATE CASCADE;

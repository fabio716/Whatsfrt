// Em containers minimal (Docker prod), `dotenv` pode não estar instalado e a
// env já vem injetada pelo runtime (docker-compose env_file). Em dev, dotenv
// carrega o .env local. O try/catch torna a config robusta nas duas situações.

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv/config");
} catch {
  // sem dotenv — env já vem do runtime, segue normal
}

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});

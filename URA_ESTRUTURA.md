# 📁 Estrutura de Arquivos - Motor da URA

```
src/
├── lib/
│   ├── ura/
│   │   ├── types.ts              ✅ CRIADO - Interfaces TypeScript
│   │   ├── session.ts            ✅ CRIADO - Gerenciador de sessões (Redis + BD)
│   │   ├── businessHours.ts      ⏳ CRIAR - Validador de expediente
│   │   ├── stateMachine.ts       ⏳ CRIAR - Engine da State Machine
│   │   ├── nodes/                ⏳ CRIAR - Handlers de cada nó
│   │   │   ├── commercial.ts     ⏳ Fluxo comercial
│   │   │   └── night.ts          ⏳ Fluxo noturno
│   │   └── assignment.ts         ⏳ CRIAR - Lógica de atribuição (B2B, Território, Round Robin)
│   │
│   └── redis.ts                  ⏳ CRIAR - Cliente Redis
│
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   └── evolution/
│   │   │       └── route.ts      ⏳ CRIAR - Webhook da Evolution API
│   │   │
│   │   └── admin/
│   │       └── ura/
│   │           ├── config/
│   │           │   └── route.ts  ⏳ CRIAR - API de configuração
│   │           ├── cooperatives/
│   │           │   └── route.ts  ⏳ CRIAR - CRUD cooperativas
│   │           └── territories/
│   │               └── route.ts  ⏳ CRIAR - CRUD territórios
│   │
│   └── admin/
│       └── ura/
│           └── page.tsx          ⏳ CRIAR - Painel com 4 tabs
│
└── components/
    └── admin/
        └── ura/
            ├── TabExpediente.tsx      ⏳ CRIAR - Tab 1
            ├── TabFluxoNoturno.tsx    ⏳ CRIAR - Tab 2
            ├── TabCooperativas.tsx    ⏳ CRIAR - Tab 3
            └── TabTerritorio.tsx      ⏳ CRIAR - Tab 4

prisma/
├── schema.prisma                 ✅ ATUALIZADO - Novos models
└── migrations/
    └── XXXXXX_add_ura_models/    ⏳ CRIAR - Migration SQL
        └── migration.sql

ARQUITETURA_URA.md                ✅ CRIADO - Documentação completa
URA_ESTRUTURA.md                  ✅ CRIADO - Este arquivo
```

---

## 📊 Resumo de Progresso

| Componente | Status | Descrição |
|------------|--------|-----------|
| **Schema Prisma** | ✅ | Models criados: UraSession, Cooperative, Territory, NightOffer |
| **Types** | ✅ | Interfaces TypeScript completas |
| **Session Manager** | ✅ | Redis + PostgreSQL com TTL |
| **Redis Client** | ⏳ | Conexão com Redis |
| **Business Hours** | ⏳ | Validação de expediente |
| **State Machine** | ⏳ | Engine principal da URA |
| **Webhook Handler** | ⏳ | Endpoint Evolution API |
| **Painel Admin** | ⏳ | 4 tabs (Expediente, Noturno, B2B, Território) |
| **APIs CRUD** | ⏳ | Cooperativas e Territórios |
| **Migrations** | ⏳ | SQL para criar tabelas |

---

## 🎯 Próxima Ação

**Aguardando aprovação do usuário para:**
1. Criar módulo Redis (`src/lib/redis.ts`)
2. Criar validador de expediente (`src/lib/ura/businessHours.ts`)
3. Criar State Machine Engine (`src/lib/ura/stateMachine.ts`)
4. Criar Webhook Handler (`src/app/api/webhook/evolution/route.ts`)
5. Criar Painel Administrativo completo
6. Gerar migrations SQL

---

**Total de arquivos a criar:** ~15 arquivos
**Tempo estimado:** 2-3 horas de desenvolvimento

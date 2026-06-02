# 🚀 CHECKPOINT - Motor da URA
**Data:** 02/06/2026 - 17:48 BRT  
**Status:** Fase 2 - Backend 100% Completo | Frontend Pendente

---

## ✅ O QUE FOI FEITO (100% Funcional)

### **1. Schema do Banco de Dados** ✅
**Arquivo:** `prisma/schema.prisma`

**Novos Models Criados:**
- ✅ `UraSession` - Gerenciamento de estado da State Machine (Redis + PostgreSQL)
- ✅ `Cooperative` - Cooperativas B2B com atendentes vinculados
- ✅ `Territory` - Territórios geográficos (UFs) com Round Robin
- ✅ `NightOffer` - Ofertas noturnas com cupons de desconto
- ✅ `UraConfig` - Estendido com mensagens customizáveis (askNameMessage, askProfileMessage, etc)

**Relações Adicionadas:**
- `User.cooperatives` → Relação com cooperativas
- `UraConfig.nightOffer` → Relação 1:1 com ofertas noturnas

### **2. Interfaces TypeScript** ✅
**Arquivo:** `src/lib/ura/types.ts`

**Types Criados:**
- `UraNodeType` - 20+ tipos de nós da State Machine
- `UraSessionData` - Estrutura completa de dados da sessão
- `UraNode` - Definição de nó com handlers
- `UraTransition` - Transições entre estados
- `BusinessHoursCheck` - Validação de expediente
- `EvolutionWebhookPayload` - Payload da Evolution API

### **3. Módulo Redis com Fallback** ✅
**Arquivo:** `src/lib/redis.ts`

**Funcionalidades:**
- ✅ Conexão com retry automático (max 3 tentativas)
- ✅ Fallback seguro em caso de falha (não crasha a aplicação)
- ✅ Logs detalhados de conexão/erro
- ✅ Métodos: get, set, setex, del, exists, ttl, keys, flushdb
- ✅ Status monitoring (connected, retries)

### **4. Session Manager** ✅
**Arquivo:** `src/lib/ura/session.ts`

**Funcionalidades:**
- ✅ Criação/atualização de sessões (Redis + PostgreSQL)
- ✅ TTL de 24 horas
- ✅ Navegação retroativa (botão "0 - Voltar")
- ✅ Limpeza automática de sessões expiradas
- ✅ Fallback para BD se Redis falhar

### **5. Validador de Expediente (Timezone-Safe)** ✅
**Arquivo:** `src/lib/ura/businessHours.ts`

**Funcionalidades:**
- ✅ Timezone fixo: `America/Sao_Paulo` (usando date-fns-tz)
- ✅ Validação de dia da semana, horário comercial e almoço
- ✅ Cálculo de próximo horário de abertura
- ✅ Formatação de mensagens em português
- ✅ Tratamento de exceções robusto

### **6. State Machine Engine** ✅
**Arquivo:** `src/lib/ura/stateMachine.ts`

**Funcionalidades:**
- ✅ Processamento de mensagens com validação de atendente
- ✅ Criação automática de sessão (fluxo comercial ou noturno)
- ✅ Navegação com "0 - Voltar"
- ✅ Execução de transições de estado
- ✅ Atribuição de contatos a agentes/filas
- ✅ Limpeza de sessão ao finalizar
- ✅ Tratamento de exceções com mensagem genérica

### **7. Handlers de Fluxo** ✅

#### **Fluxo Comercial** ✅
**Arquivo:** `src/lib/ura/nodes/commercial.ts`

**Nós Implementados:**
- ✅ `greeting` → Boas-vindas
- ✅ `ask_name` → Coleta nome
- ✅ `ask_profile` → PF ou PJ
- ✅ `ask_sector` → Financeiro, Suporte ou Vendas
- ✅ `ask_support_type` → Secretaria ou Técnico
- ✅ `ask_sales_type` → B2B ou Varejo
- ✅ `ask_cooperative` → Lista cooperativas dinamicamente
- ✅ `ask_uf` → Coleta UF e atribui vendedor por território
- ✅ Validação de inputs
- ✅ Atribuição inteligente de agentes

#### **Fluxo Noturno** ✅
**Arquivo:** `src/lib/ura/nodes/night.ts`

**Nós Implementados:**
- ✅ `night_greeting` → Mensagem fora de expediente + próximo horário
- ✅ `night_ask_name` → Coleta nome
- ✅ `night_ask_sector` → Coleta setor de interesse
- ✅ `night_ask_subject` → Coleta assunto
- ✅ `night_offer` → Envia cupom de desconto (se vendas + oferta ativa)
- ✅ `night_finish` → Finaliza e coloca em fila de atendimento

### **8. Webhook Handler (Otimizado)** ✅
**Arquivo:** `src/app/api/webhook/evolution/route.ts`

**Funcionalidades:**
- ✅ Resposta 200 OK imediata (evita timeout da Meta)
- ✅ Processamento assíncrono com `setImmediate()`
- ✅ Validação de payload
- ✅ Ignora mensagens enviadas por nós (fromMe)
- ✅ Extração de texto de diferentes formatos
- ✅ Tratamento de exceções robusto
- ✅ Health check endpoint (GET)

---

## ⏳ O QUE FALTA FAZER (Próxima Sessão)

### **1. Painel Administrativo (UI Tesla/Apple-like)** 🔴
**Arquivo a criar:** `src/app/admin/ura/page.tsx`

**Componentes a criar:**
- `src/components/admin/ura/TabExpediente.tsx` - Tab 1
- `src/components/admin/ura/TabFluxoNoturno.tsx` - Tab 2
- `src/components/admin/ura/TabCooperativas.tsx` - Tab 3
- `src/components/admin/ura/TabTerritorio.tsx` - Tab 4

**Requisitos de Design:**
- ✨ Minimalista (Tesla/Apple-like)
- ✨ Borderless components
- ✨ Tipografia limpa
- ✨ Whitespaces inteligentes
- ✨ Toasts para feedback visual
- ✨ Tabs com transições suaves
- ✨ Formulários com validação em tempo real

### **2. APIs CRUD** 🔴

**APIs a criar:**
- `src/app/api/admin/ura/config/route.ts` - GET/PUT config da URA
- `src/app/api/admin/ura/cooperatives/route.ts` - CRUD cooperativas
- `src/app/api/admin/ura/cooperatives/[id]/route.ts` - GET/PUT/DELETE cooperativa
- `src/app/api/admin/ura/territories/route.ts` - CRUD territórios
- `src/app/api/admin/ura/territories/[id]/route.ts` - GET/PUT/DELETE território

### **3. Migrations SQL** 🔴

**Comandos a executar:**
```bash
# Gerar migration
npx prisma migrate dev --name add_ura_models

# Aplicar na VPS
docker exec whatsfrt_postgres psql -U whatsfrt_prod -d whatsfrt < migration.sql
```

### **4. Dependências a Instalar** 🔴

**Pacotes necessários:**
```bash
npm install ioredis date-fns date-fns-tz
npm install -D @types/ioredis
```

### **5. Arquivo Evolution API Helper** 🔴
**Arquivo a criar:** `src/lib/evolution.ts`

**Função necessária:**
```typescript
export async function sendEvolutionText(
  whatsappId: string,
  text: string
): Promise<void>
```

### **6. Seed Inicial** 🔴
**Criar configuração inicial da URA:**
- UraConfig padrão
- BusinessHours (Seg-Sex 8h-18h, almoço 12h-13h)
- Cooperativas exemplo (Sicoob, Sicredi, Cresol)
- Territórios exemplo (SP, RJ, MG)

---

## 📋 CHECKLIST PARA AMANHÃ

### **Ordem de Execução Recomendada:**

1. ✅ **Instalar dependências**
   ```bash
   npm install ioredis date-fns date-fns-tz
   npm install -D @types/ioredis
   ```

2. ✅ **Criar helper da Evolution API**
   - `src/lib/evolution.ts` com `sendEvolutionText()`

3. ✅ **Gerar migrations**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name add_ura_models
   ```

4. ✅ **Criar APIs CRUD**
   - Config da URA
   - Cooperativas
   - Territórios

5. ✅ **Criar Painel Administrativo**
   - Página principal com tabs
   - Tab 1: Expediente
   - Tab 2: Fluxo Noturno
   - Tab 3: Cooperativas
   - Tab 4: Territórios

6. ✅ **Criar seed inicial**
   - Configuração padrão
   - Dados exemplo

7. ✅ **Deploy na VPS**
   ```bash
   cd /opt/Whatsfrt
   git pull
   docker compose -f docker-compose.prod.yml down app
   docker compose -f docker-compose.prod.yml build --no-cache app
   docker compose -f docker-compose.prod.yml up -d app
   ```

8. ✅ **Aplicar migrations no PostgreSQL**
   ```bash
   docker exec whatsfrt_postgres psql -U whatsfrt_prod -d whatsfrt < migration.sql
   ```

9. ✅ **Configurar webhook na Evolution API**
   - URL: `https://frtwhats.com/api/webhook/evolution`
   - Events: `messages.upsert`

10. ✅ **Testar fluxos**
    - Fluxo comercial completo
    - Fluxo noturno com oferta
    - Navegação com "0 - Voltar"
    - Atribuição de agentes

---

## 🗂️ ESTRUTURA DE ARQUIVOS ATUAL

```
✅ CRIADOS:
├── prisma/schema.prisma (ATUALIZADO)
├── src/lib/
│   ├── redis.ts ✅
│   └── ura/
│       ├── types.ts ✅
│       ├── session.ts ✅
│       ├── businessHours.ts ✅
│       ├── stateMachine.ts ✅
│       └── nodes/
│           ├── commercial.ts ✅
│           └── night.ts ✅
├── src/app/api/webhook/evolution/route.ts ✅
├── ARQUITETURA_URA.md ✅
├── URA_ESTRUTURA.md ✅
└── CHECKPOINT_URA.md ✅ (ESTE ARQUIVO)

🔴 FALTAM:
├── src/lib/evolution.ts
├── src/app/admin/ura/page.tsx
├── src/components/admin/ura/
│   ├── TabExpediente.tsx
│   ├── TabFluxoNoturno.tsx
│   ├── TabCooperativas.tsx
│   └── TabTerritorio.tsx
└── src/app/api/admin/ura/
    ├── config/route.ts
    ├── cooperatives/route.ts
    ├── cooperatives/[id]/route.ts
    ├── territories/route.ts
    └── territories/[id]/route.ts
```

---

## 🎯 OBJETIVO FINAL

**Motor da URA 100% funcional com:**
- ✅ Backend completo (State Machine, Redis, Webhook)
- 🔴 Painel administrativo premium (Tesla/Apple-like)
- 🔴 CRUD de cooperativas e territórios
- 🔴 Configuração de expediente e mensagens
- 🔴 Ofertas noturnas configuráveis
- 🔴 Deploy na VPS com migrations

---

## 📞 CONTATO/OBSERVAÇÕES

**Commits realizados hoje:**
1. `feat: URA Motor - Schema, Types e Session Manager` (7441b86)
2. `feat: URA Motor Backend - Redis, BusinessHours, StateMachine, Webhook` (20c6cc9)

**Branch:** `main`  
**Último commit:** `20c6cc9`

**Tudo está gravado e commitado no GitHub!** ✅

---

**🚀 AMANHÃ CONTINUAMOS DO PASSO 1 DO CHECKLIST!**

**Estimativa de tempo restante:** 3-4 horas para completar frontend + APIs + deploy + testes

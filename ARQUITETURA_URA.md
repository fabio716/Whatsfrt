# 🤖 Arquitetura do Motor da URA - WhatsFRT

## 📋 Visão Geral

Sistema de URA (Atendimento Automático) baseado em **State Machine** com:
- ✅ Webhook da Evolution API
- ✅ Persistência de sessão no Redis + PostgreSQL
- ✅ Validação de expediente (timezone `America/Sao_Paulo`)
- ✅ Navegação retroativa (botão "0 - Voltar")
- ✅ Fluxo Comercial (horário de expediente)
- ✅ Fluxo Noturno (captura de leads + ofertas)

---

## 🗄️ Schema do Banco de Dados

### **Novos Models Criados:**

#### 1. **UraSession** (State Machine)
```prisma
model UraSession {
  whatsappId    String   @unique
  currentNode   String   // Estado atual
  previousNode  String?  // Para navegação "0 - Voltar"
  isNightFlow   Boolean
  
  // Dados coletados
  collectedName    String?
  collectedProfile String? // "PF" ou "PJ"
  collectedSector  String?
  collectedSubject String?
  
  expiresAt     DateTime // TTL 24h
}
```

#### 2. **Cooperative** (Tab 3 - B2B)
```prisma
model Cooperative {
  name           String
  cnpjBase       String?
  assignedUserId String? // Atendente B2B
}
```

#### 3. **Territory** (Tab 4 - Geográfico)
```prisma
model Territory {
  uf              String   @unique // "SP", "RJ", etc
  assignedUserIds String[] // Array de atendentes (Round Robin)
}
```

#### 4. **NightOffer** (Tab 2 - Ofertas Noturnas)
```prisma
model NightOffer {
  isActive       Boolean
  couponCode     String
  discountType   String  // "percentage" ou "fixed"
  discountValue  Float
  storeUrl       String
  offerMessage   String  // Template com {coupon}, {discount}, {url}
}
```

#### 5. **UraConfig** (Estendido)
Adicionados campos para mensagens customizáveis:
- `askNameMessage`
- `askProfileMessage`
- `askSectorMessage`
- `nightAskNameMessage`
- `nightAskSectorMessage`
- `nightAskSubjectMessage`

---

## 🔄 Fluxo da State Machine

### **☀️ Fluxo Comercial (Expediente Aberto)**

```
1. greeting
   ↓
2. ask_name (coleta nome)
   ↓
3. ask_profile (PF/PJ)
   ↓
4. ask_sector
   ├─ 1️⃣ Financeiro → assign_to_queue (FINANCEIRO)
   ├─ 2️⃣ Suporte → ask_support_type
   │   ├─ 1️⃣ Secretaria → assign_to_agent (secretária)
   │   └─ 2️⃣ Técnico → assign_to_queue (SUPORTE)
   └─ 3️⃣ Vendas → ask_sales_type
       ├─ 1️⃣ B2B → ask_cooperative
       │   └─ Lista cooperativas → assign_to_agent (consultor B2B)
       └─ 2️⃣ Varejo → ask_uf
           └─ UF → assign_to_agent (vendedor da região)
```

### **🌙 Fluxo Noturno (Fora do Expediente)**

```
1. night_greeting
   ↓
2. night_ask_name (coleta nome)
   ↓
3. night_ask_sector (coleta setor)
   ↓
4. night_ask_subject (coleta assunto)
   ↓
5. night_offer (se setor = VENDAS e oferta ativa)
   ↓
6. night_finish (status = WAITING_AGENT)
```

---

## 🎨 Painel Administrativo (4 Tabs)

### **Tab 1: ⏰ Expediente**
- Configuração de horários por dia da semana
- Templates de mensagens (Boas-vindas, Fora de Horário, Almoço)

### **Tab 2: 🌙 Fluxo Noturno**
- Ativar/Desativar ofertas noturnas
- Código do cupom
- Tipo de desconto (% ou R$)
- URL da loja
- Template da mensagem de oferta

### **Tab 3: 🏢 B2B / Cooperativas**
- CRUD de cooperativas
- Vincular atendente B2B a cada cooperativa

### **Tab 4: 🗺️ Geográfico (Varejo)**
- Mapa/Grid de UFs
- Atribuir atendentes por estado
- Suporte a múltiplos atendentes (Round Robin)

---

## 🔧 Tecnologias Utilizadas

- **Next.js 15** (App Router)
- **TypeScript**
- **Prisma ORM**
- **Redis** (sessões + cache)
- **PostgreSQL**
- **Evolution API** (WhatsApp)
- **Tailwind CSS** + **shadcn/ui**

---

## 📡 Webhook da Evolution API

**Endpoint:** `/api/webhook/evolution`

**Fluxo:**
1. Recebe mensagem do WhatsApp
2. Verifica se há atendente atribuído (se sim, ignora URA)
3. Busca/cria sessão no Redis
4. Valida expediente (timezone `America/Sao_Paulo`)
5. Executa State Machine
6. Envia resposta via Evolution API
7. Atualiza sessão no Redis + PostgreSQL

---

## ✅ Próximos Passos

1. ✅ Schema Prisma criado
2. ✅ Interfaces TypeScript criadas
3. ✅ Session Manager criado
4. ⏳ Criar módulo Redis
5. ⏳ Criar validador de expediente
6. ⏳ Criar State Machine Engine
7. ⏳ Criar Webhook Handler
8. ⏳ Criar Painel Administrativo (4 tabs)
9. ⏳ Migrations e testes

---

**Status:** 🟡 Aguardando aprovação para continuar implementação

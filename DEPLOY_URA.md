# 🚀 GUIA DE DEPLOY - Motor da URA

## ✅ PRÉ-REQUISITOS
- [x] Código commitado no GitHub
- [x] Dependências instaladas localmente (ioredis, date-fns, date-fns-tz)
- [x] Migrations SQL criadas

---

## 📋 PASSO A PASSO

### **1. Pull do Código na VPS**
```bash
cd /opt/Whatsfrt
git pull origin main
```

### **2. Aplicar Migrations no PostgreSQL**
```bash
docker exec -i whatsfrt_postgres psql -U whatsfrt_prod -d whatsfrt < migrations_ura.sql
```

### **3. Rebuild do App (com novas dependências)**
```bash
cd /opt/Whatsfrt
docker compose -f docker-compose.prod.yml down app
docker compose -f docker-compose.prod.yml build --no-cache app
docker compose -f docker-compose.prod.yml up -d app
```

**Aguarde ~5 minutos para o build completar.**

### **4. Verificar Logs**
```bash
docker logs whatsfrt_app --tail 50 -f
```

Deve aparecer:
```
✅ [Redis] Connected successfully
✓ Ready in XXXms
```

### **5. Configurar Webhook na Evolution API**

**URL do Webhook:**
```
https://frtwhats.com/api/webhook/evolution
```

**Events:**
- `messages.upsert`

**Como configurar:**
1. Acesse a Evolution API
2. Vá em Settings → Webhooks
3. Adicione a URL acima
4. Ative o evento `messages.upsert`

### **6. Acessar Painel Administrativo**

**URL:**
```
https://frtwhats.com/admin/ura-motor
```

**Login:**
- Email: `admin@empresa.com`
- Senha: `123`

---

## 🎯 CONFIGURAÇÃO INICIAL

### **Tab 1: Expediente**
1. Configure horários de funcionamento (Seg-Sex 8h-18h)
2. Defina horário de almoço (12h-13h)
3. Personalize mensagens de boas-vindas
4. Salve

### **Tab 2: Fluxo Noturno**
1. Ative ofertas noturnas (se desejar)
2. Configure cupom de desconto
3. Defina URL da loja
4. Salve

### **Tab 3: Cooperativas**
1. Crie cooperativas (Sicoob, Sicredi, etc já vêm cadastradas)
2. Atribua consultores B2B a cada cooperativa
3. Salve

### **Tab 4: Territórios**
1. Crie territórios por UF (SP, RJ, MG já vêm cadastrados)
2. Atribua vendedores a cada estado
3. Suporta múltiplos vendedores (Round Robin automático)
4. Salve

---

## 🧪 TESTES

### **Teste 1: Fluxo Comercial (Horário de Expediente)**
1. Envie mensagem no WhatsApp durante horário comercial
2. Deve receber boas-vindas
3. Informar nome
4. Escolher perfil (PF/PJ)
5. Escolher setor (Financeiro, Suporte ou Vendas)
6. Se Vendas → B2B ou Varejo
7. Deve ser atribuído ao agente correto

### **Teste 2: Fluxo Noturno (Fora do Expediente)**
1. Envie mensagem fora do horário
2. Deve receber mensagem de expediente fechado
3. Informar nome
4. Escolher setor
5. Descrever assunto
6. Se Vendas + Oferta ativa → Recebe cupom
7. Fica em fila para atendimento

### **Teste 3: Navegação "0 - Voltar"**
1. Durante qualquer etapa, digite `0`
2. Deve voltar para etapa anterior

---

## 🔧 TROUBLESHOOTING

### **Erro: Redis não conecta**
```bash
docker logs whatsfrt_redis
docker restart whatsfrt_redis
```

### **Erro: Webhook não recebe mensagens**
1. Verifique URL do webhook na Evolution API
2. Teste endpoint:
```bash
curl https://frtwhats.com/api/webhook/evolution
```
Deve retornar: `{"status":"ok"}`

### **Erro: Mensagens não são enviadas**
1. Verifique variáveis de ambiente:
```bash
docker exec whatsfrt_app printenv | grep EVOLUTION
```

Deve ter:
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE_NAME`

### **Erro: Painel não carrega**
1. Verifique se app está rodando:
```bash
docker ps | grep whatsfrt_app
```

2. Veja logs:
```bash
docker logs whatsfrt_app --tail 100
```

---

## 📊 MONITORAMENTO

### **Ver sessões ativas da URA**
```bash
docker exec whatsfrt_redis redis-cli KEYS "ura:session:*"
```

### **Ver detalhes de uma sessão**
```bash
docker exec whatsfrt_redis redis-cli GET "ura:session:5511999999999@s.whatsapp.net"
```

### **Limpar sessões expiradas**
```sql
docker exec whatsfrt_postgres psql -U whatsfrt_prod -d whatsfrt -c "DELETE FROM ura_sessions WHERE \"expiresAt\" < NOW();"
```

---

## ✅ CHECKLIST FINAL

- [ ] Código deployado na VPS
- [ ] Migrations aplicadas
- [ ] App rebuilded e rodando
- [ ] Redis conectado
- [ ] Webhook configurado na Evolution API
- [ ] Painel administrativo acessível
- [ ] Expediente configurado
- [ ] Cooperativas cadastradas
- [ ] Territórios configurados
- [ ] Testes de fluxo comercial OK
- [ ] Testes de fluxo noturno OK
- [ ] Navegação "0 - Voltar" OK

---

**🎉 MOTOR DA URA 100% OPERACIONAL!**

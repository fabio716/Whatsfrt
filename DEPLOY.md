# 🚀 Deploy Híbrido: Cloudflare Pages + VPS

Arquitetura de produção otimizada com Next.js na edge global (Cloudflare) e backend na VPS.

---

## 📋 Pré-requisitos

### VPS (DigitalOcean, Contabo, etc.)
- **Mínimo:** 1GB RAM, 25GB SSD, Ubuntu 22.04
- **Recomendado:** 2GB RAM para produção estável
- **IP público** e acesso SSH root

### Cloudflare
- Conta gratuita
- Domínio configurado (ex: `whatsfrt.com.br`)

---

## 🏗️ Parte 1: Setup da VPS (Backend)

### 1.1 Conectar na VPS

```bash
ssh root@SEU_IP_VPS
```

### 1.2 Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y
systemctl enable docker
systemctl start docker
```

### 1.3 Clonar o repositório

```bash
cd /opt
git clone https://github.com/SEU_USUARIO/whatsfrt.git
cd whatsfrt
```

### 1.4 Configurar variáveis de ambiente

```bash
cp env.production.template .env
nano .env
```

**Preencha:**
- `POSTGRES_PASSWORD` — senha forte (32 chars)
- `JWT_SECRET` — gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `EVOLUTION_API_KEY` — senha forte para Evolution API
- `EVOLUTION_WEBHOOK_URL` — `https://SEU_DOMINIO.com.br/api/webhooks/evolution`
- `EVOLUTION_SERVER_URL` — `http://SEU_IP:8080`

### 1.5 Subir os containers

```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

### 1.6 Rodar migrations Prisma

**Da sua máquina local:**

```bash
DATABASE_URL="postgresql://whatsfrt_prod:SUA_SENHA@SEU_IP:5432/whatsfrt?schema=public" npx prisma migrate deploy
```

### 1.7 Criar usuário admin

**Na VPS:**

```bash
cd /opt/whatsfrt
npx tsx scripts/create-admin.ts admin@empresa.com SenhaForte123 "Admin Master"
```

### 1.8 Verificar logs

```bash
docker compose -f docker-compose.prod.yml logs -f
```

---

## ☁️ Parte 2: Deploy no Cloudflare Pages

### 2.1 Instalar dependências

**Na sua máquina local:**

```bash
npm install -D @cloudflare/next-on-pages wrangler
```

### 2.2 Criar `wrangler.toml`

Arquivo já criado no repositório. Verifique se o `name` está correto.

### 2.3 Build para Cloudflare

```bash
npm run pages:build
```

### 2.4 Deploy

```bash
npx wrangler pages deploy .vercel/output/static --project-name=whatsfrt
```

### 2.5 Configurar variáveis de ambiente no Cloudflare

No dashboard Cloudflare Pages → Settings → Environment Variables:

```
DATABASE_URL=postgresql://whatsfrt_prod:SUA_SENHA@SEU_IP:5432/whatsfrt?schema=public
JWT_SECRET=SEU_JWT_SECRET_64_CHARS
EVOLUTION_API_URL=http://SEU_IP:8080
EVOLUTION_API_KEY=SUA_API_KEY
EVOLUTION_WEBHOOK_URL=https://SEU_DOMINIO.com.br/api/webhooks/evolution
EVOLUTION_INSTANCE_NAME=whatsfrt
```

---

## 🔒 Parte 3: SSL com Certbot (Opcional)

### 3.1 Instalar Certbot

```bash
apt install certbot python3-certbot-nginx -y
```

### 3.2 Obter certificado

```bash
certbot --nginx -d api.seudominio.com.br
```

### 3.3 Renovação automática

```bash
certbot renew --dry-run
```

---

## 🧪 Testes

### Verificar PostgreSQL
```bash
docker exec -it whatsfrt_postgres psql -U whatsfrt_prod -d whatsfrt -c "SELECT COUNT(*) FROM users;"
```

### Verificar Evolution API
```bash
curl -H "apikey: SUA_API_KEY" http://SEU_IP:8080/instance/fetchInstances
```

### Verificar Next.js (Cloudflare)
```bash
curl https://SEU_DOMINIO.com.br/api/health
```

---

## 📊 Monitoramento

### Logs em tempo real
```bash
docker compose -f docker-compose.prod.yml logs -f evolution_api
```

### Status dos containers
```bash
docker compose -f docker-compose.prod.yml ps
```

### Uso de recursos
```bash
docker stats
```

---

## 🔄 Atualizações

### Atualizar código na VPS
```bash
cd /opt/whatsfrt
git pull origin main
./scripts/deploy-vps.sh
```

### Atualizar Next.js no Cloudflare
```bash
npm run pages:build
npx wrangler pages deploy .vercel/output/static --project-name=whatsfrt
```

---

## 🆘 Troubleshooting

### Evolution API não conecta
- Verifique se a porta 8080 está aberta no firewall
- Confira os logs: `docker logs whatsfrt_evolution`

### Webhook não chega
- Verifique se `EVOLUTION_WEBHOOK_URL` aponta para o domínio Cloudflare
- Teste manualmente: `curl -X POST https://SEU_DOMINIO/api/webhooks/evolution`

### Erro de conexão PostgreSQL
- Verifique se a porta 5432 está aberta
- Teste: `telnet SEU_IP 5432`

---

## 💰 Custos Estimados

- **VPS DigitalOcean:** $6/mês (1GB RAM)
- **Cloudflare Pages:** Grátis (até 500 builds/mês)
- **Domínio:** ~R$40/ano

**Total:** ~$6/mês + domínio

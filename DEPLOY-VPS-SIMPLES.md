# 🚀 Deploy Simplificado - VPS Completa

Deploy de **tudo em uma VPS**: Next.js + PostgreSQL + Evolution API + Redis

---

## 📋 Pré-requisitos

- VPS com Ubuntu 22.04 (mínimo 1GB RAM)
- IP público
- Acesso SSH root

**Recomendações:**
- DigitalOcean Droplet Basic: $6/mês
- Contabo VPS S: €4.50/mês
- Hetzner CX11: €4.51/mês

---

## 🎯 Passo a Passo

### 1️⃣ Conectar na VPS

```bash
ssh root@SEU_IP_VPS
```

### 2️⃣ Instalar Docker

```bash
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin git -y
systemctl enable docker
systemctl start docker
```

### 3️⃣ Clonar o repositório

```bash
cd /opt
git clone https://github.com/SEU_USUARIO/whatsfrt.git
cd whatsfrt
```

### 4️⃣ Configurar variáveis de ambiente

```bash
cp env.production.template .env
nano .env
```

**Preencha os valores:**

```bash
# Gerar senha forte PostgreSQL (32 chars)
POSTGRES_PASSWORD=$(openssl rand -base64 32)

# Gerar JWT Secret (64 chars hex)
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Gerar API Key Evolution
EVOLUTION_API_KEY=$(openssl rand -base64 32)

# Configurar URLs (substitua SEU_IP pelo IP da VPS)
EVOLUTION_WEBHOOK_URL=http://SEU_IP/api/webhooks/evolution
EVOLUTION_SERVER_URL=http://SEU_IP:8080
```

**Exemplo de `.env` preenchido:**

```env
POSTGRES_USER=whatsfrt_prod
POSTGRES_PASSWORD=xK9mP2vL8qR4nT6wY1sZ3aB5cD7eF9gH
POSTGRES_DB=whatsfrt

DATABASE_URL=postgresql://whatsfrt_prod:xK9mP2vL8qR4nT6wY1sZ3aB5cD7eF9gH@postgres:5432/whatsfrt?schema=public

JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

EVOLUTION_API_URL=http://evolution_api:8080
EVOLUTION_API_KEY=nM8oP9qR0sT1uV2wX3yZ4aB5cD6eF7gH
EVOLUTION_WEBHOOK_URL=http://SEU_IP/api/webhooks/evolution
EVOLUTION_SERVER_URL=http://SEU_IP:8080
EVOLUTION_INSTANCE_NAME=whatsfrt

REDIS_URL=redis://redis:6379
```

### 5️⃣ Rodar deploy

```bash
chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh
```

**Isso vai:**
- Baixar imagens Docker
- Buildar o Next.js
- Subir PostgreSQL, Redis, Evolution API, Next.js e Nginx
- Aguardar inicialização

### 6️⃣ Rodar migrations Prisma

```bash
docker exec -it whatsfrt_app npx prisma migrate deploy
```

### 7️⃣ Criar usuário admin

```bash
docker exec -it whatsfrt_app npx tsx scripts/create-admin.ts admin@empresa.com SenhaForte123 "Admin Master"
```

### 8️⃣ Configurar SSL (Opcional mas recomendado)

```bash
# Instalar Certbot
apt install certbot -y

# Parar Nginx temporariamente
docker stop whatsfrt_nginx

# Obter certificado (substitua SEU_DOMINIO)
certbot certonly --standalone -d seudominio.com.br -d www.seudominio.com.br

# Copiar certificados para pasta do projeto
mkdir -p /opt/whatsfrt/docker/ssl
cp /etc/letsencrypt/live/seudominio.com.br/fullchain.pem /opt/whatsfrt/docker/ssl/
cp /etc/letsencrypt/live/seudominio.com.br/privkey.pem /opt/whatsfrt/docker/ssl/

# Reiniciar Nginx
docker start whatsfrt_nginx
```

### 9️⃣ Configurar Firewall

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## ✅ Verificar

### Acessar o sistema

```
http://SEU_IP        (ou https://seudominio.com.br se configurou SSL)
```

### Fazer login

- Email: `admin@empresa.com`
- Senha: `SenhaForte123`

### Parear WhatsApp

1. Ir em `/admin/connect`
2. Escanear QR code
3. Aguardar conexão

---

## 📊 Monitoramento

### Ver logs

```bash
# Todos os containers
docker compose -f docker-compose.prod.yml logs -f

# Apenas Next.js
docker logs -f whatsfrt_app

# Apenas Evolution API
docker logs -f whatsfrt_evolution
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

Quando fizer mudanças no código:

```bash
cd /opt/whatsfrt
git pull origin main
./scripts/deploy-vps.sh
```

---

## 🆘 Troubleshooting

### Container não sobe

```bash
docker logs whatsfrt_app
docker logs whatsfrt_evolution
```

### Banco de dados não conecta

```bash
docker exec -it whatsfrt_postgres psql -U whatsfrt_prod -d whatsfrt -c "SELECT 1;"
```

### Resetar tudo

```bash
docker compose -f docker-compose.prod.yml down -v
docker system prune -a
./scripts/deploy-vps.sh
```

---

## 💰 Custos

- **VPS DigitalOcean:** $6/mês
- **Domínio (opcional):** ~R$40/ano
- **SSL (Let's Encrypt):** Grátis

**Total:** $6/mês

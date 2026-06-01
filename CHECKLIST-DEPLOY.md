# ✅ Checklist de Deploy - WhatsFRT

## 📦 Preparação Local

- [ ] Instalar dependências Cloudflare
  ```bash
  npm install
  ```

- [ ] Testar build local
  ```bash
  npm run pages:build
  ```

- [ ] Commitar e pushar código
  ```bash
  git add .
  git commit -m "feat: preparar deploy produção"
  git push origin main
  ```

---

## 🖥️ Setup da VPS

### Provisionamento
- [ ] Contratar VPS (DigitalOcean, Contabo, etc.)
  - Mínimo: 1GB RAM, 25GB SSD
  - Sistema: Ubuntu 22.04 LTS
  - Anotar IP público: `_______________`

- [ ] Configurar DNS (se tiver domínio)
  - Tipo A: `api.seudominio.com.br` → IP da VPS
  - Tipo A: `@` ou `www` → Cloudflare (configurar depois)

### Instalação
- [ ] Conectar via SSH
  ```bash
  ssh root@SEU_IP
  ```

- [ ] Instalar Docker
  ```bash
  curl -fsSL https://get.docker.com | sh
  apt install docker-compose-plugin git -y
  ```

- [ ] Clonar repositório
  ```bash
  cd /opt
  git clone https://github.com/SEU_USUARIO/whatsfrt.git
  cd whatsfrt
  ```

### Configuração
- [ ] Criar arquivo `.env`
  ```bash
  cp env.production.template .env
  nano .env
  ```

- [ ] Preencher variáveis críticas:
  - [ ] `POSTGRES_PASSWORD` (gerar senha forte)
  - [ ] `JWT_SECRET` (64 chars hex)
  - [ ] `EVOLUTION_API_KEY` (senha forte)
  - [ ] `EVOLUTION_WEBHOOK_URL` (URL Cloudflare)
  - [ ] `EVOLUTION_SERVER_URL` (http://SEU_IP:8080)

- [ ] Subir containers
  ```bash
  chmod +x scripts/deploy-vps.sh
  ./scripts/deploy-vps.sh
  ```

- [ ] Verificar saúde
  ```bash
  docker compose -f docker-compose.prod.yml ps
  docker logs whatsfrt_evolution
  ```

### Banco de Dados
- [ ] Rodar migrations (da máquina local)
  ```bash
  DATABASE_URL="postgresql://whatsfrt_prod:SENHA@SEU_IP:5432/whatsfrt" npx prisma migrate deploy
  ```

- [ ] Criar usuário admin (na VPS)
  ```bash
  cd /opt/whatsfrt
  npx tsx scripts/create-admin.ts admin@empresa.com SenhaForte123 "Admin"
  ```

### Firewall
- [ ] Abrir portas necessárias
  ```bash
  ufw allow 22/tcp    # SSH
  ufw allow 80/tcp    # HTTP
  ufw allow 443/tcp   # HTTPS
  ufw allow 5432/tcp  # PostgreSQL (apenas se Cloudflare precisar)
  ufw allow 8080/tcp  # Evolution API
  ufw enable
  ```

---

## ☁️ Deploy Cloudflare Pages

### Conta Cloudflare
- [ ] Criar conta em https://dash.cloudflare.com
- [ ] Adicionar domínio (se tiver)
- [ ] Anotar Zone ID: `_______________`

### Configuração do Projeto
- [ ] Criar novo projeto Pages
  - Nome: `whatsfrt`
  - Framework: Next.js
  - Build command: `npm run pages:build`
  - Build output: `.vercel/output/static`

### Variáveis de Ambiente
- [ ] Configurar no dashboard (Settings → Environment Variables):
  ```
  DATABASE_URL=postgresql://whatsfrt_prod:SENHA@SEU_IP:5432/whatsfrt
  JWT_SECRET=SEU_JWT_SECRET_64_CHARS
  EVOLUTION_API_URL=http://SEU_IP:8080
  EVOLUTION_API_KEY=SUA_API_KEY
  EVOLUTION_WEBHOOK_URL=https://SEU_DOMINIO/api/webhooks/evolution
  EVOLUTION_INSTANCE_NAME=whatsfrt
  ```

### Deploy Inicial
- [ ] Deploy via CLI (da máquina local)
  ```bash
  npx wrangler pages deploy .vercel/output/static --project-name=whatsfrt
  ```

- [ ] Ou conectar repositório GitHub
  - Settings → Builds & deployments → Connect to Git

### DNS
- [ ] Configurar domínio customizado
  - Pages → Custom domains → Add domain
  - Tipo CNAME: `www` → `whatsfrt.pages.dev`

---

## 🧪 Testes de Produção

### Backend (VPS)
- [ ] PostgreSQL acessível
  ```bash
  telnet SEU_IP 5432
  ```

- [ ] Evolution API respondendo
  ```bash
  curl -H "apikey: SUA_KEY" http://SEU_IP:8080/instance/fetchInstances
  ```

- [ ] Logs sem erros
  ```bash
  docker logs whatsfrt_evolution --tail 50
  ```

### Frontend (Cloudflare)
- [ ] Site carregando
  ```
  https://SEU_DOMINIO
  ```

- [ ] Login funcionando
  - Acessar `/login`
  - Entrar com admin criado

- [ ] Webhook recebendo eventos
  - Parear WhatsApp em `/admin/connect`
  - Verificar logs na VPS

### Integração
- [ ] Enviar mensagem de teste
  - Mandar "oi" para o número pareado
  - Verificar se aparece no `/admin/chats`

- [ ] URA funcionando
  - Configurar menu em `/admin/ura`
  - Testar fluxo completo

---

## 🔒 Segurança

- [ ] SSL configurado (Cloudflare automático)
- [ ] Senhas fortes em todas as variáveis
- [ ] Firewall ativo na VPS
- [ ] Backups automáticos do PostgreSQL
  ```bash
  crontab -e
  # Adicionar: 0 2 * * * docker exec whatsfrt_postgres pg_dump -U whatsfrt_prod whatsfrt > /backup/db_$(date +\%Y\%m\%d).sql
  ```

---

## 📊 Monitoramento

- [ ] Configurar alertas Cloudflare
- [ ] Monitorar uso de recursos VPS
  ```bash
  htop
  docker stats
  ```

- [ ] Logs centralizados (opcional)
  - Considerar Grafana + Loki

---

## 🎉 Conclusão

- [ ] Documentar credenciais em local seguro (1Password, Bitwarden)
- [ ] Compartilhar URLs com equipe
- [ ] Treinar usuários no sistema

**URLs Finais:**
- Frontend: `https://_______________`
- Evolution API: `http://_______________:8080`
- PostgreSQL: `_______________:5432`

---

**Data do deploy:** ___/___/______
**Responsável:** _______________

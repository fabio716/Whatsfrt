@AGENTS.md

## Mapa da infraestrutura — frtwhats.com

| Camada | Provedor / Recurso | Detalhes |
|---|---|---|
| Registro do domínio | IONOS | `frtwhats.com` + e-mail (MX mx00/mx01.ionos.com) |
| DNS + Proxy/CDN | Cloudflare | Registro A → `62.171.178.160` (proxied). SSL: **Full (strict)** — nunca mudar pra Flexible (causa loop de redirect 301). |
| Servidor (VPS) | Contabo — Cloud VPS 20 SSD | Instância `vmi3340550` • IP `62.171.178.160` • Ubuntu 24.04 • usuário `root` |
| Acesso de emergência | VNC Contabo | `5.189.154.85:63180` (cliente TightVNC) — usar quando SSH não conecta; habilitar no painel Contabo + reboot da instância |
| Aplicação | `/opt/Whatsfrt` | Stack Docker • deploy produção: `docker-compose.prod.yml` |
| Certificado SSL | Let's Encrypt (host) | `/etc/letsencrypt/live/frtwhats.com` (montado no container nginx) |

### Containers da aplicação

| Container | Imagem | Função / Portas |
|---|---|---|
| `whatsfrt_nginx` | nginx:alpine | Proxy reverso do site • 80:80 e 443:443 • config: `docker/nginx.ssl.conf` |
| `whatsfrt_app` | whatsfrt-app | Aplicação principal (Next.js) • porta 3000 |
| `whatsfrt_evolution` | evoapicloud/evolution-api:v2.3.7 | API de WhatsApp (provider alternativo — hoje só se usa Z-API) • porta 8080 |
| `whatsfrt_postgres` | postgres:16-alpine | Banco de dados • usuário `whatsfrt_prod`, banco `whatsfrt` • porta 5432 |
| `whatsfrt_redis` | redis:7-alpine | Cache/filas • porta 6379 (interna) |

**Importante**: o nginx do sistema operacional (pacote Ubuntu) está **PARADO e DESABILITADO** de propósito (`systemctl disable nginx`). Não faz parte da aplicação — se reativado, rouba as portas 80/443 do container e derruba o site.

### Runbook — diagnóstico rápido em caso de queda

| Sintoma | Causa provável | Ação |
|---|---|---|
| Erro 522 (Cloudflare) | VPS suspenso ou travado | Verificar faturas na Contabo; conferir status da instância; Restart pelo painel. |
| "Welcome to nginx" | nginx do host roubou as portas, OU container nginx com config antiga na memória | No servidor: `systemctl status nginx` (deve estar inactive/disabled — se não, `systemctl stop nginx && systemctl disable nginx`). Se já tiver desligado, é config antiga: `docker exec whatsfrt_nginx nginx -t` e `docker exec whatsfrt_nginx nginx -s reload`. |
| Loop de redirecionamento 301 | SSL do Cloudflare em Flexible | Cloudflare → SSL/TLS → Overview → mudar pra **Full (strict)**. |
| Erro 526 (SSL inválido) | Certificado Let's Encrypt vencido | No servidor: `certbot renew`; se urgente, Cloudflare em Full (sem strict) temporariamente. |
| WhatsApp desconectado | Sessão expirada na Z-API/Evolution | Entrar no sistema e reconectar a instância (reescanear QR se for Evolution). |
| Sem acesso SSH | Firewall/senha incorreta | Usar VNC: habilitar no painel Contabo + reboot; conectar via TightVNC em `5.189.154.85:63180`. |

### Pendências para evitar reincidência (do incidente de 02/08/2026)

1. **Alta** — Contabo: cadastrar método de pagamento reserva (ex.: PayPal) e garantir que os e-mails de cobrança cheguem a uma caixa lida pela diretoria (causa raiz da queda: cartão recusado → VPS suspenso).
2. **Alta** — Configurar UptimeRobot (gratuito) com monitor HTTPS em frtwhats.com e alertas por e-mail/push.
3. **Média** — Registrar credenciais em cofre seguro do grupo: conta Contabo, senha root do VPS, senha VNC, painel Cloudflare e IONOS.
4. **Média** — Mapear demais serviços/assinaturas do grupo (cobranças recorrentes em USD/EUR) e montar inventário de infraestrutura.
5. **Baixa** — Avaliar migração do acesso VNC para SSH com chave (mais seguro e permite copiar/colar).

## Regras de deploy em produção (CRÍTICO)

- Deploy em produção usa SEMPRE `docker compose -f docker-compose.prod.yml up -d` —
  NUNCA `docker-compose.yml` (esse é o de desenvolvimento; o nginx dele sobe sem as
  portas 80/443).
- O nginx que serve o site é o CONTAINER `whatsfrt_nginx` (portas 80/443 +
  certificados do host em `/etc/letsencrypt`). NUNCA instalar, habilitar ou
  iniciar o nginx do sistema (apt/systemctl) — ele rouba as portas do
  container. Ele está mascarado/desabilitado de propósito.
- Cloudflare está em SSL Full (strict) — o redirect http→https do nginx
  depende disso; não mudar.
- Cloudflare corta conexões proxied em torno de ~100s — rotas que processam
  lotes grandes (ex: sincronizar fotos) precisam terminar bem antes disso ou
  o navegador recebe 504 mesmo com o processamento continuando no servidor.
- Servidor: `/opt/Whatsfrt` (W maiúsculo). Branch de trabalho:
  `claude/requisitar-cliente-e-import-aditivo`.
- Usuário do Postgres em produção é `whatsfrt_prod` (banco `whatsfrt`), não
  `whatsfrt` — conferir com `docker exec whatsfrt_postgres env | grep POSTGRES`
  se tiver dúvida antes de rodar uma migration manual.
- Depois de QUALQUER deploy que muda `prisma/schema.prisma`, aplicar a
  migration manualmente via `psql` ANTES de constar o novo código no ar (ou
  o app entra em crash loop por coluna/tabela faltando). `prisma migrate
  deploy` falha no container standalone por causa do `prisma.config.ts`.
- Após qualquer deploy, validar com:
  `curl -sk https://localhost/ -o /dev/null -w "%{http_code}"` (esperado:
  200/301) e `docker logs --tail 30 whatsfrt_app` (sem erro de Prisma).
- Se o site mostrar a página padrão "Welcome to nginx!" (em vez do
  WhatsFRT): o container `whatsfrt_nginx` está de pé mas rodando uma
  config ANTIGA carregada na memória — editar `docker/nginx.ssl.conf` (ou
  o `default.conf` dentro do container) não recarrega sozinho. Corrigir com
  `docker exec whatsfrt_nginx nginx -t` (valida a config atual em disco) e,
  se OK, `docker exec whatsfrt_nginx nginx -s reload`. Evite
  `docker restart whatsfrt_nginx` a menos que o reload não resolva — reload
  é mais rápido e não derruba conexões em andamento.

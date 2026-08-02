@AGENTS.md

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

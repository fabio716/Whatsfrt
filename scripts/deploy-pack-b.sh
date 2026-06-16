#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Deploy Pack B — Reliability Pipeline
# ═══════════════════════════════════════════════════════════════════════════
#
# Cole este script INTEIRO no terminal PuTTY conectado na VPS.
# Ele é idempotente: pode rodar várias vezes sem efeito colateral.
#
# Pré-requisitos:
#   - Repositório clonado em /opt/Whatsfrt
#   - Docker + Docker Compose plugin instalados
#   - .env já existente com DATABASE_URL, JWT_SECRET, EVOLUTION_API_KEY, etc.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO_DIR=/opt/Whatsfrt
ENV_FILE=$REPO_DIR/.env

echo "═════════════════════════════════════════════════════════"
echo "  Deploy Pack B — Reliability"
echo "═════════════════════════════════════════════════════════"
echo

cd $REPO_DIR

# ─── 1. Backup do .env antes de mexer ────────────────────────────────────────
BACKUP_NAME=".env.backup-$(date +%Y%m%d-%H%M%S)"
cp $ENV_FILE $REPO_DIR/$BACKUP_NAME
echo "[1/8] backup .env -> $BACKUP_NAME"

# ─── 2. git pull ─────────────────────────────────────────────────────────────
echo "[2/8] git pull"
git fetch --all
git checkout main
git pull --ff-only

# ─── 3. Garantir EVOLUTION_WEBHOOK_SECRET no .env ────────────────────────────
if ! grep -q "^EVOLUTION_WEBHOOK_SECRET=" $ENV_FILE; then
  SECRET=$(openssl rand -hex 32)
  echo "EVOLUTION_WEBHOOK_SECRET=$SECRET" >> $ENV_FILE
  echo "[3/8] EVOLUTION_WEBHOOK_SECRET gerado e adicionado"
else
  echo "[3/8] EVOLUTION_WEBHOOK_SECRET ja existe — mantendo"
fi

# ─── 4. Garantir APP_PUBLIC_URL ──────────────────────────────────────────────
if ! grep -q "^APP_PUBLIC_URL=" $ENV_FILE; then
  # Tenta derivar do EVOLUTION_WEBHOOK_URL
  PUBLIC=$(grep "^EVOLUTION_WEBHOOK_URL=" $ENV_FILE | head -1 | cut -d= -f2- | sed 's|/api/.*||')
  if [ -z "$PUBLIC" ]; then PUBLIC="https://frtwhats.com"; fi
  echo "APP_PUBLIC_URL=$PUBLIC" >> $ENV_FILE
  echo "[4/8] APP_PUBLIC_URL=$PUBLIC adicionado"
else
  echo "[4/8] APP_PUBLIC_URL ja existe — mantendo"
fi

# ─── 5. Patch DATABASE_URL com connection_limit + pool_timeout ───────────────
if grep -q "^DATABASE_URL=" $ENV_FILE && ! grep "^DATABASE_URL=" $ENV_FILE | grep -q "connection_limit"; then
  # Adiciona os params preservando o resto. Funciona com ou sem ?schema=
  sed -i.tmp -E 's#^(DATABASE_URL=[^?]+)(\?[^[:space:]]*)?$#\1\2\&connection_limit=20\&pool_timeout=20#' $ENV_FILE
  # Se nao tinha ?, o & solto vira ? (corrige):
  sed -i.tmp 's#DATABASE_URL=\([^?&]*\)&connection_limit#DATABASE_URL=\1?connection_limit#' $ENV_FILE
  rm -f $ENV_FILE.tmp
  echo "[5/8] DATABASE_URL atualizado com connection_limit=20"
else
  echo "[5/8] DATABASE_URL ja tem connection_limit — pulando"
fi

# ─── 6. Build da imagem ──────────────────────────────────────────────────────
echo "[6/8] docker compose build app (pode demorar 1-3 min)"
docker compose -f docker-compose.prod.yml build app

# ─── 7. Migration Prisma ─────────────────────────────────────────────────────
echo "[7/8] aplicando migration (adiciona whatsappKeyId, clientKey, etc)"
docker compose -f docker-compose.prod.yml run --rm \
  -e DATABASE_URL=$(grep '^DATABASE_URL=' $ENV_FILE | cut -d= -f2-) \
  app npx prisma migrate deploy

# ─── 8. Subir tudo ───────────────────────────────────────────────────────────
echo "[8/8] subindo containers"
docker compose -f docker-compose.prod.yml up -d

# ─── Smoke tests ─────────────────────────────────────────────────────────────
echo
echo "─── aguardando 15s pro app subir e workers iniciarem ───"
sleep 15

echo
echo "─── /api/health ────────────────────────────────────────"
if curl -fsS http://localhost:3000/api/health > /tmp/health.json; then
  echo "✅ health OK"
  cat /tmp/health.json | python3 -m json.tool 2>/dev/null || cat /tmp/health.json
else
  echo "❌ health respondeu 503 ou nao respondeu — investigue"
  curl -s http://localhost:3000/api/health || true
fi

echo
echo "─── workers iniciaram? ─────────────────────────────────"
docker logs whatsfrt_app --tail 50 2>&1 | grep -E "watchdog|queue|reaper|reliability" || \
  echo "⚠️  Nenhum log de worker — algo errado, veja: docker logs whatsfrt_app"

echo
echo "─── connection state do Evolution ──────────────────────"
docker logs whatsfrt_app --tail 100 2>&1 | grep -E "watchdog.*estado" | tail -3

echo
echo "═════════════════════════════════════════════════════════"
echo "  Deploy concluido"
echo "═════════════════════════════════════════════════════════"
echo
echo "Proximo passo: no container Evolution, garantir que o secret bate:"
echo "  WEBHOOK_GLOBAL_HEADER_APIKEY=\$EVOLUTION_WEBHOOK_SECRET"
echo
echo "Para rollback (se algo der errado):"
echo "  cd $REPO_DIR && git checkout <commit anterior> && docker compose -f docker-compose.prod.yml up -d --build"
echo "  cp $BACKUP_NAME .env"
echo

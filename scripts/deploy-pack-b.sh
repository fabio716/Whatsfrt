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

# ─── 7. Migration via psql (não depende do prisma CLI + dotenv) ──────────────
echo "[7/8] aplicando migration via psql"
PG_USER=$(grep ^POSTGRES_USER $ENV_FILE | cut -d= -f2-)
PG_DB=$(grep ^POSTGRES_DB $ENV_FILE | cut -d= -f2-)

# Garante tabela _prisma_migrations (caso DB tenha sido inicializada sem ela).
docker exec -i whatsfrt_postgres psql -U "$PG_USER" -d "$PG_DB" -q <<'SQL' > /dev/null
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  id VARCHAR(36) PRIMARY KEY,
  checksum VARCHAR(64) NOT NULL,
  finished_at TIMESTAMP WITH TIME ZONE,
  migration_name VARCHAR(255) NOT NULL,
  logs TEXT,
  rolled_back_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  applied_steps_count INTEGER NOT NULL DEFAULT 0
);
SQL

# Para cada migration:
#  - já em _prisma_migrations → skip
#  - mais antiga que a primeira reliability → baseline (assume schema já em prod)
#  - nova → aplica SQL e marca
#
# BASELINE_THRESHOLD é a data da primeira migration introduzida POR este pack.
# Tudo nascido antes dela é assumido como já aplicado em produção. Quando
# futuras migrations forem adicionadas, atualize este threshold OU registre
# manualmente as antigas em _prisma_migrations.
BASELINE_THRESHOLD="20260616000000_"

mark_applied() {
  local name=$1 source=$2
  docker exec -i whatsfrt_postgres psql -U "$PG_USER" -d "$PG_DB" -q -v ON_ERROR_STOP=1 <<SQL > /dev/null
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
VALUES ('${name}_${source}', '$source', now(), '$name', now(), 1);
SQL
}

for MIG_DIR in prisma/migrations/*/; do
  MIG_NAME=$(basename "$MIG_DIR")
  [ -f "${MIG_DIR}migration.sql" ] || continue

  APPLIED=$(docker exec whatsfrt_postgres psql -U "$PG_USER" -d "$PG_DB" -tAc \
    "SELECT 1 FROM \"_prisma_migrations\" WHERE migration_name = '$MIG_NAME'" 2>/dev/null || echo "")

  if [ -n "$APPLIED" ]; then
    echo "  • $MIG_NAME já registrada — pulando"
    continue
  fi

  if [[ "$MIG_NAME" < "$BASELINE_THRESHOLD" ]]; then
    mark_applied "$MIG_NAME" baseline
    echo "  • $MIG_NAME baselined (schema já em prod)"
    continue
  fi

  echo "  • aplicando $MIG_NAME"
  if docker exec -i whatsfrt_postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 \
      < "${MIG_DIR}migration.sql" > /tmp/mig_${MIG_NAME}.log 2>&1; then
    mark_applied "$MIG_NAME" psql
    echo "    ✓ $MIG_NAME aplicada"
  else
    echo "    ✗ $MIG_NAME FALHOU — ver /tmp/mig_${MIG_NAME}.log"
    tail -20 /tmp/mig_${MIG_NAME}.log
    exit 1
  fi
done

# ─── 8. Subir tudo (recreate força containers a relerem .env) ────────────────
echo "[8/8] subindo containers (force-recreate p/ ler .env atualizado)"
docker compose -f docker-compose.prod.yml up -d --force-recreate

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

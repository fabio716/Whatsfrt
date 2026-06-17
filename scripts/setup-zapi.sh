#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Setup Z-API — troca provider de Evolution para Z-API sem dor
#
# Cole no PuTTY conectado na VPS:
#   cd /opt/Whatsfrt && git pull && bash scripts/setup-zapi.sh
#
# O script:
#   1. Backup do .env
#   2. Pede Instance ID, Token, Client Token (ou gera um)
#   3. Atualiza/adiciona no .env: WHATSAPP_PROVIDER=zapi + ZAPI_*
#   4. Build da imagem
#   5. Restart só do app (Evolution continua up por enquanto, fallback)
#   6. Verifica /api/health + logs do watchdog
#   7. Mostra próximos passos
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

REPO_DIR=/opt/Whatsfrt
ENV_FILE=$REPO_DIR/.env

cd $REPO_DIR

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo
echo "═════════════════════════════════════════════════════════"
echo "  Setup Z-API — WhatsFrt"
echo "═════════════════════════════════════════════════════════"
echo

# ─── 1. Backup ──────────────────────────────────────────────────────────────
BACKUP_NAME=".env.backup-zapi-$(date +%Y%m%d-%H%M%S)"
cp $ENV_FILE $REPO_DIR/$BACKUP_NAME
echo -e "[1/7] ${GREEN}✓${NC} backup .env → $BACKUP_NAME"

# ─── 2. Pede credenciais (com defaults se ja tiver) ─────────────────────────
echo
echo "[2/7] Credenciais Z-API"
echo "      Pega no painel https://app.z-api.io na sua instancia."
echo

# Pega valores existentes (se houver) pra mostrar como default
CURRENT_INSTANCE=$(grep ^ZAPI_INSTANCE_ID= $ENV_FILE 2>/dev/null | cut -d= -f2- || echo "")
CURRENT_TOKEN=$(grep ^ZAPI_TOKEN= $ENV_FILE 2>/dev/null | cut -d= -f2- || echo "")
CURRENT_CLIENT=$(grep ^ZAPI_CLIENT_TOKEN= $ENV_FILE 2>/dev/null | cut -d= -f2- || echo "")

# Instance ID
if [ -n "$CURRENT_INSTANCE" ]; then
  read -p "      Instance ID [${CURRENT_INSTANCE:0:8}...]: " INSTANCE_ID
  INSTANCE_ID=${INSTANCE_ID:-$CURRENT_INSTANCE}
else
  read -p "      Instance ID: " INSTANCE_ID
fi

if [ -z "$INSTANCE_ID" ]; then
  echo -e "      ${RED}✗ Instance ID obrigatório. Abortando.${NC}"
  exit 1
fi

# Token
if [ -n "$CURRENT_TOKEN" ]; then
  read -p "      Token [${CURRENT_TOKEN:0:8}...]: " TOKEN
  TOKEN=${TOKEN:-$CURRENT_TOKEN}
else
  read -p "      Token: " TOKEN
fi

if [ -z "$TOKEN" ]; then
  echo -e "      ${RED}✗ Token obrigatório. Abortando.${NC}"
  exit 1
fi

# Client Token (opcional)
if [ -n "$CURRENT_CLIENT" ]; then
  echo "      Client Token atual: ${CURRENT_CLIENT:0:8}..."
  read -p "      Manter? [S/n/gerar novo (g)]: " CLIENT_CHOICE
  case ${CLIENT_CHOICE:-S} in
    g|G) CLIENT_TOKEN=$(openssl rand -hex 32) ;;
    n|N) CLIENT_TOKEN="" ;;
    *)   CLIENT_TOKEN=$CURRENT_CLIENT ;;
  esac
else
  echo "      Client Token (header Client-Token nos webhooks Z-API)"
  echo "      Reforça segurança contra injeção de webhook fake."
  read -p "      Tem um Client Token configurado no painel Z-API? [s/N]: " HAS_CLIENT
  if [[ "${HAS_CLIENT,,}" == "s" ]]; then
    read -p "      Cola aqui: " CLIENT_TOKEN
  else
    read -p "      Gera um novo automaticamente? [S/n]: " GEN_CLIENT
    if [[ "${GEN_CLIENT,,}" != "n" ]]; then
      CLIENT_TOKEN=$(openssl rand -hex 32)
      echo -e "      ${YELLOW}→ Gerou: ${CLIENT_TOKEN}${NC}"
      echo -e "      ${YELLOW}→ Configure este mesmo valor no painel Z-API em 'Segurança → Webhooks → Client-Token'${NC}"
    else
      CLIENT_TOKEN=""
      echo -e "      ${YELLOW}⚠ Sem Client Token = webhook aceita request de qualquer um. Considere configurar depois.${NC}"
    fi
  fi
fi

# ─── 3. Atualiza .env ────────────────────────────────────────────────────────
echo
echo "[3/7] Atualizando .env"

# Helper: seta variável no .env (idempotente)
set_env_var() {
  local key=$1 value=$2
  if grep -q "^${key}=" $ENV_FILE; then
    sed -i "s|^${key}=.*|${key}=${value}|" $ENV_FILE
    echo -e "      ${GREEN}✓${NC} ${key} atualizado"
  else
    echo "${key}=${value}" >> $ENV_FILE
    echo -e "      ${GREEN}✓${NC} ${key} adicionado"
  fi
}

set_env_var WHATSAPP_PROVIDER zapi
set_env_var ZAPI_INSTANCE_ID "$INSTANCE_ID"
set_env_var ZAPI_TOKEN "$TOKEN"
set_env_var ZAPI_CLIENT_TOKEN "$CLIENT_TOKEN"

# ─── 4. Build da imagem ──────────────────────────────────────────────────────
echo
echo "[4/7] Build da imagem (rápido se layers cacheadas)"
docker compose -f docker-compose.prod.yml build app 2>&1 | tail -5

# ─── 5. Restart só do app ────────────────────────────────────────────────────
echo
echo "[5/7] Restart do app (sem mexer em Evolution/Postgres/Redis)"
docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps app

echo
echo "      Aguardando 20s pro app subir e workers iniciarem..."
sleep 20

# ─── 6. Health check ─────────────────────────────────────────────────────────
echo
echo "[6/7] Verificação"

HEALTH=$(curl -s http://localhost:3000/api/health || echo "")
if [ -z "$HEALTH" ]; then
  echo -e "      ${RED}✗ /api/health não respondeu — app pode estar com problema${NC}"
  echo "      docker logs whatsfrt_app --tail 30"
  exit 1
fi

echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

# Verifica que provider mudou pra zapi
PROVIDER_ENV=$(docker exec whatsfrt_app printenv WHATSAPP_PROVIDER 2>/dev/null || echo "")
if [ "$PROVIDER_ENV" = "zapi" ]; then
  echo -e "\n      ${GREEN}✓ App rodando com provider=zapi${NC}"
else
  echo -e "\n      ${RED}✗ Provider não mudou (env: '${PROVIDER_ENV}')${NC}"
fi

# Verifica logs do watchdog
echo
echo "      Logs recentes do watchdog/workers:"
docker logs --since 30s whatsfrt_app 2>&1 | grep -E "reliability|watchdog|queue worker|reaper" | tail -10 | sed 's/^/        /'

# ─── 7. Próximos passos ─────────────────────────────────────────────────────
echo
echo "═════════════════════════════════════════════════════════"
echo -e "  ${GREEN}Setup concluído.${NC}"
echo "═════════════════════════════════════════════════════════"
echo
echo "PRÓXIMOS PASSOS:"
echo
echo "  1. Configura webhooks no painel Z-API (https://app.z-api.io):"
echo "       URL: https://frtwhats.com/api/webhooks/zapi"
echo "       Colar em: Ao receber, Ao desconectar, Ao conectar,"
echo "                 Receber status da mensagem"
echo "       Deixe 'Ignorar' OFF em todos esses."
if [ -n "$CLIENT_TOKEN" ]; then
  echo
  echo "  2. No painel Z-API, configure o Client-Token igual a:"
  echo "       $CLIENT_TOKEN"
  echo "     (em 'Segurança' ou no campo de header de cada webhook)"
fi
echo
echo "  3. Conecta o chip:"
echo "       https://app.z-api.io → sua instância → escanear QR"
echo
echo "  4. Teste end-to-end:"
echo "       a) Mande WhatsApp do seu celular pessoal pro número conectado"
echo "       b) Veja chegar em https://frtwhats.com/admin/chats"
echo
echo "PARA VOLTAR PRA EVOLUTION (rollback):"
echo "  sed -i 's/^WHATSAPP_PROVIDER=zapi/WHATSAPP_PROVIDER=evolution/' .env"
echo "  docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps app"
echo
echo "ARQUIVO DE BACKUP DO .env:"
echo "  $REPO_DIR/$BACKUP_NAME"
echo

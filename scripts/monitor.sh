#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Monitor do WhatsFRT — roda a cada 5 min pelo cron e avisa NO SEU WHATSAPP
# quando algo cai. Instalar (como root):
#   crontab -e  →  */5 * * * * /opt/Whatsfrt/scripts/monitor.sh >> /root/monitor.log 2>&1
# Configure o número de alerta abaixo (DDI+DDD+número, só dígitos).
# Anti-spam: cada tipo de alerta dispara no máx. 1x por hora.
# ═══════════════════════════════════════════════════════════════════════════
set -u
ALERT_PHONE="5544XXXXXXXXX"   # ← TROCAR pelo celular do Fabio
ENV_FILE="/opt/Whatsfrt/.env"
STATE_DIR="/tmp/whatsfrt-monitor"
mkdir -p "$STATE_DIR"

# Lê credenciais Z-API do .env do app
ZAPI_INSTANCE_ID="$(grep -E '^ZAPI_INSTANCE_ID=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' )"
ZAPI_TOKEN="$(grep -E '^ZAPI_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' )"
ZAPI_CLIENT_TOKEN="$(grep -E '^ZAPI_CLIENT_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' )"
ZAPI_BASE="https://api.z-api.io/instances/$ZAPI_INSTANCE_ID/token/$ZAPI_TOKEN"

alerta() {
  local chave="$1"; local msg="$2"
  local marca="$STATE_DIR/$chave"
  # Só alerta se o último alerta desse tipo foi há mais de 60 min
  if [ -f "$marca" ] && [ $(( $(date +%s) - $(stat -c %Y "$marca") )) -lt 3600 ]; then
    return
  fi
  touch "$marca"
  echo "$(date '+%d/%m %H:%M') ALERTA [$chave]: $msg"
  curl -sS -m 15 -X POST "$ZAPI_BASE/send-text" \
    -H "Content-Type: application/json" \
    -H "Client-Token: $ZAPI_CLIENT_TOKEN" \
    -d "{\"phone\":\"$ALERT_PHONE\",\"message\":\"🚨 *WhatsFRT — Alerta*\n$msg\n$(date '+%d/%m %H:%M')\"}" > /dev/null || true
}

ok() { rm -f "$STATE_DIR/$1"; }

# 1. App no ar? (health check interno)
HTTP="$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://localhost/api/health || echo 000)"
if [ "$HTTP" != "200" ]; then
  alerta "app" "O sistema está FORA DO AR (health check retornou $HTTP). Verifique o servidor: ssh root@62.171.178.160 e rode: docker ps"
else
  ok "app"
fi

# 2. WhatsApp conectado? (status da instância Z-API)
CONN="$(curl -sS -m 15 "$ZAPI_BASE/status" -H "Client-Token: $ZAPI_CLIENT_TOKEN" | grep -o '"connected":[a-z]*' | cut -d: -f2)"
if [ "$CONN" = "false" ]; then
  alerta "zapi" "O WhatsApp da empresa DESCONECTOU da Z-API — mensagens de clientes NÃO estão chegando! Entre no painel da Z-API e reconecte (QR code)."
elif [ "$CONN" = "true" ]; then
  ok "zapi"
fi

# 3. Disco acima de 90%?
USO="$(df / --output=pcent | tail -1 | tr -dc '0-9')"
if [ "${USO:-0}" -ge 90 ]; then
  alerta "disco" "O disco do servidor está em ${USO}% — risco de parar de receber mídias. Rode: docker builder prune -af"
else
  ok "disco"
fi

# 4. Container do banco rodando?
if ! docker ps --format '{{.Names}}' | grep -q '^whatsfrt_postgres$'; then
  alerta "postgres" "O container do BANCO DE DADOS não está rodando! Rode: cd /opt/Whatsfrt && docker compose -f docker-compose.prod.yml up -d"
else
  ok "postgres"
fi

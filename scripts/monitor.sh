#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Monitor do WhatsFRT — roda a cada 5 min pelo cron e avisa POR E-MAIL.
#
# Instalar (como root):
#   crontab -e  →  */5 * * * * /opt/Whatsfrt/scripts/monitor.sh >> /root/monitor.log 2>&1
#
# POR QUE E-MAIL E NÃO WHATSAPP:
# A versão anterior mandava o alerta pelo próprio Z-API. Em 25/09/2026 o
# Z-API bloqueou a conta por pendência de pagamento: o envio parou para toda
# a equipe E o alerta sobre isso também não saiu, porque ia pelo canal
# quebrado. Canal de aviso não pode depender do que ele vigia.
#
# Precisa no /opt/Whatsfrt/.env:
#   ALERT_EMAIL=fabio@exemplo.com.br      ← para quem vai o alerta
#   SMTP_HOST=smtp.exemplo.com.br
#   SMTP_PORT=465                          ← 465 (SSL) ou 587 (STARTTLS)
#   SMTP_USER=avisos@exemplo.com.br
#   SMTP_PASS=a-senha-ou-senha-de-app
#   SMTP_FROM=avisos@exemplo.com.br        ← opcional; padrão = SMTP_USER
#
# Anti-spam: cada tipo de alerta dispara no máx. 1x por hora.
# ═══════════════════════════════════════════════════════════════════════════
set -u
ENV_FILE="/opt/Whatsfrt/.env"
STATE_DIR="/tmp/whatsfrt-monitor"
COMPOSE="/opt/Whatsfrt/docker-compose.prod.yml"
mkdir -p "$STATE_DIR"

le_env() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' ; }

ZAPI_INSTANCE_ID="$(le_env ZAPI_INSTANCE_ID)"
ZAPI_TOKEN="$(le_env ZAPI_TOKEN)"
ZAPI_CLIENT_TOKEN="$(le_env ZAPI_CLIENT_TOKEN)"
ZAPI_BASE="https://api.z-api.io/instances/$ZAPI_INSTANCE_ID/token/$ZAPI_TOKEN"

ALERT_EMAIL="$(le_env ALERT_EMAIL)"
SMTP_HOST="$(le_env SMTP_HOST)"
SMTP_PORT="$(le_env SMTP_PORT)"
SMTP_USER="$(le_env SMTP_USER)"
SMTP_PASS="$(le_env SMTP_PASS)"
SMTP_FROM="$(le_env SMTP_FROM)"
[ -z "${SMTP_FROM:-}" ] && SMTP_FROM="$SMTP_USER"
[ -z "${SMTP_PORT:-}" ] && SMTP_PORT="465"

# ─── Envio do e-mail ────────────────────────────────────────────────────────
# curl fala SMTP, então não precisa instalar nada no servidor. Porta 465 =
# smtps (SSL já na conexão); qualquer outra vai como smtp + STARTTLS.
enviar_email() {
  local assunto="$1"; local corpo="$2"
  if [ -z "${ALERT_EMAIL:-}" ] || [ -z "${SMTP_HOST:-}" ] || [ -z "${SMTP_USER:-}" ]; then
    echo "  (e-mail não configurado no .env — alerta ficou só no log)"
    return 1
  fi

  local esquema="smtp"
  [ "$SMTP_PORT" = "465" ] && esquema="smtps"

  local arquivo="$STATE_DIR/mail.$$.txt"
  # Assunto sem acento de propósito: cabeçalho de e-mail com UTF-8 exigiria
  # codificação MIME, e não vale a complexidade num alerta.
  {
    echo "From: WhatsFRT <$SMTP_FROM>"
    echo "To: $ALERT_EMAIL"
    echo "Subject: $assunto"
    echo "MIME-Version: 1.0"
    echo "Content-Type: text/plain; charset=UTF-8"
    echo
    echo "$corpo"
    echo
    echo "---"
    echo "Servidor: $(hostname) - $(date '+%d/%m/%Y %H:%M:%S')"
    echo "Aviso do monitor automatico (roda a cada 5 min)."
  } > "$arquivo"

  curl -sS -m 30 --url "$esquema://$SMTP_HOST:$SMTP_PORT" --ssl-reqd \
    --mail-from "$SMTP_FROM" --mail-rcpt "$ALERT_EMAIL" \
    --upload-file "$arquivo" --user "$SMTP_USER:$SMTP_PASS"
  local saida=$?
  rm -f "$arquivo"
  return $saida
}

alerta() {
  local chave="$1"; local titulo="$2"; local msg="$3"
  local marca="$STATE_DIR/$chave"
  if [ -f "$marca" ] && [ $(( $(date +%s) - $(stat -c %Y "$marca") )) -lt 3600 ]; then
    return
  fi
  touch "$marca"
  echo "$(date '+%d/%m %H:%M') ALERTA [$chave]: $msg"
  enviar_email "WhatsFRT - $titulo" "$msg" || true
}

ok() { rm -f "$STATE_DIR/$1"; }

# ─── Modo teste ─────────────────────────────────────────────────────────────
# ./monitor.sh --teste  → manda um e-mail de teste e sai. Serve pra validar a
# configuração de SMTP sem precisar esperar um problema de verdade acontecer.
if [ "${1:-}" = "--teste" ]; then
  echo "Enviando e-mail de teste para: ${ALERT_EMAIL:-(nao configurado)}"
  if enviar_email "WhatsFRT - Teste do monitor" \
"Este é um e-mail de teste do monitor do WhatsFRT.

Se você recebeu isto, os alertas estão funcionando e vão chegar por aqui
quando o sistema tiver problema: site fora do ar, Z-API recusando chamadas,
mensagens falhando, disco cheio ou banco parado."; then
    echo "OK — e-mail aceito pelo servidor de SMTP. Confira a caixa de entrada (e o spam)."
    exit 0
  else
    echo "FALHOU — confira SMTP_HOST, SMTP_PORT, SMTP_USER e SMTP_PASS no $ENV_FILE"
    exit 1
  fi
fi

# ─── 1. O sistema responde? ─────────────────────────────────────────────────
# Pelo caminho real (Cloudflare + nginx): localhost devolve 301 porque o
# server block do nginx espera o Host frtwhats.com.
HTTP="$(curl -sk -m 10 -o /dev/null -w '%{http_code}' https://frtwhats.com/api/health || echo 000)"
if [ "$HTTP" != "200" ]; then
  alerta "app" "Sistema fora do ar" \
"O WhatsFRT não respondeu (health check devolveu $HTTP).

O que fazer:
  ssh root@62.171.178.160
  docker ps
  docker logs --tail=50 whatsfrt_app"
else
  ok "app"
fi

# ─── 2. O Z-API aceita nossas chamadas? ─────────────────────────────────────
# ATENÇÃO: aqui olhamos o CÓDIGO HTTP, não só o campo "connected".
# A versão anterior só alertava quando a resposta dizia "connected":false.
# No bloqueio por pagamento de 25/09 o Z-API devolveu 400 com uma mensagem de
# erro e NENHUM campo "connected" — o script não alertou nem marcou ok, e o
# envio ficou parado sem ninguém saber. Agora qualquer resposta que não seja
# 200 alerta, com o motivo que o provedor deu.
ZRESP="$(curl -sS -m 15 -w '\n%{http_code}' "$ZAPI_BASE/status" -H "Client-Token: $ZAPI_CLIENT_TOKEN" 2>/dev/null || printf '\n000')"
ZCODE="$(echo "$ZRESP" | tail -1)"
ZBODY="$(echo "$ZRESP" | head -n -1)"

if [ "$ZCODE" != "200" ]; then
  alerta "zapi_api" "Z-API recusando chamadas" \
"O Z-API respondeu HTTP $ZCODE. Enquanto isso durar as vendedoras NÃO conseguem enviar mensagem (recebem, mas não respondem).

Resposta do provedor:
$ZBODY

Causa mais comum: pendência de pagamento ou assinatura vencida.
Verifique em app.z-api.io, na assinatura da instância."
elif echo "$ZBODY" | grep -q '"connected":false'; then
  alerta "zapi_conn" "WhatsApp desconectado" \
"O WhatsApp da empresa desconectou do Z-API. Mensagens de clientes não estão chegando.

Entre em app.z-api.io e reconecte lendo o QR code no celular da empresa."
else
  ok "zapi_api"; ok "zapi_conn"
fi

# ─── 3. Mensagens falhando? ─────────────────────────────────────────────────
# Este é o sintoma que importa: no episódio de 25/09 o Z-API dizia
# "conectado" enquanto recusava tudo. Olhar só a conexão não pegaria. Aqui
# contamos o que de fato aconteceu com as mensagens das vendedoras.
FALHAS="$(docker exec -i whatsfrt_postgres sh -c \
  'psql -tAq -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT count(*) FROM messages WHERE direction = '"'"'OUTBOUND'"'"' AND status = '"'"'FAILED'"'"' AND \"createdAt\" > now() - interval '"'"'15 minutes'"'"';"' \
  2>/dev/null | tr -dc '0-9')"
if [ "${FALHAS:-0}" -ge 5 ]; then
  alerta "envio_falhando" "Mensagens nao estao saindo" \
"$FALHAS mensagens das vendedoras falharam nos últimos 15 minutos.

Isso quer dizer que cliente ficou sem resposta. Verifique nesta ordem:
  1. app.z-api.io - assinatura e conexão da instância
  2. docker logs --tail=80 whatsfrt_app"
else
  ok "envio_falhando"
fi

# ─── 4. Disco ───────────────────────────────────────────────────────────────
USO="$(df / --output=pcent | tail -1 | tr -dc '0-9')"
if [ "${USO:-0}" -ge 90 ]; then
  alerta "disco" "Disco quase cheio" \
"O disco do servidor está em ${USO}%. Perto de 100% o sistema para de receber imagens e áudios.

Para liberar:
  docker builder prune -af"
else
  ok "disco"
fi

# ─── 5. Banco de dados ──────────────────────────────────────────────────────
if ! docker ps --format '{{.Names}}' | grep -q '^whatsfrt_postgres$'; then
  alerta "postgres" "Banco de dados parado" \
"O container do banco não está rodando. O sistema inteiro para sem ele.

  cd /opt/Whatsfrt && docker compose -f $COMPOSE up -d"
else
  ok "postgres"
fi

echo "$(date '+%d/%m %H:%M') MONITOR-OK (health=$HTTP zapi=$ZCODE falhas15min=${FALHAS:-0} disco=${USO}%)"

#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Relatório do dia — atendimento por vendedora no seu WhatsApp.
#
# Instalar (como root):
#   crontab -e  →  0 21 * * 1-5 /opt/Whatsfrt/scripts/relatorio-diario.sh >> /root/relatorio.log 2>&1
#
# ATENÇÃO ao horário: o servidor roda em UTC e o Brasil é UTC-3, então
# "21:00" no cron = 18:00 em Brasília. Dias 1-5 = segunda a sexta.
#
# O cálculo e o envio acontecem dentro do app (rota /api/reports/daily/send).
# Este script só chama a rota com o segredo — assim as credenciais do Z-API
# ficam num lugar só, o .env do app.
#
# Precisa no /opt/Whatsfrt/.env:
#   REPORT_CRON_SECRET=<uma senha longa qualquer>
#   REPORT_PHONE=5543988654231
# ═══════════════════════════════════════════════════════════════════════════
set -u
ENV_FILE="/opt/Whatsfrt/.env"
URL="https://frtwhats.com/api/reports/daily/send"

SEGREDO="$(grep -E '^REPORT_CRON_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' )"
if [ -z "${SEGREDO:-}" ]; then
  echo "$(date '+%F %T') ERRO: REPORT_CRON_SECRET não está no $ENV_FILE"
  exit 1
fi

RESPOSTA="$(curl -sS -m 60 -X POST "$URL" -H "X-Report-Secret: $SEGREDO" || echo '{"erro":"curl falhou"}')"
echo "$(date '+%F %T') $RESPOSTA"

# "enviado":false = o relatório foi calculado mas o WhatsApp recusou o envio.
# Vale olhar o log do app nesse caso; não reenviamos pra não duplicar.
case "$RESPOSTA" in
  *'"enviado":true'*) exit 0 ;;
  *) exit 1 ;;
esac

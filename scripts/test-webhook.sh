#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Smoke test: a Evolution e o App estão se entendendo via secret?
#
# Cola no PuTTY depois do deploy. Sai com código 0 se TUDO ok, != 0 se algo
# precisa de atenção.
# ═══════════════════════════════════════════════════════════════════════════

set -u
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass(){ echo -e "${GREEN}✅ $1${NC}"; }
fail(){ echo -e "${RED}❌ $1${NC}"; FAILED=1; }
warn(){ echo -e "${YELLOW}⚠️  $1${NC}"; }

FAILED=0
APP_URL=http://localhost:3000

echo "═════════════════════════════════════════════════════════"
echo "  Smoke test do pipeline Evolution ↔ App"
echo "═════════════════════════════════════════════════════════"
echo

# ─── 1. Secrets nos dois containers batem? ───────────────────────────────────
echo "[1/5] Secrets dos dois containers…"
APP_SEC=$(docker exec whatsfrt_app printenv EVOLUTION_WEBHOOK_SECRET 2>/dev/null || echo "")
EVO_SEC=$(docker exec whatsfrt_evolution printenv WEBHOOK_GLOBAL_HEADER_APIKEY 2>/dev/null || echo "")

if [ -z "$APP_SEC" ]; then
  fail "App: EVOLUTION_WEBHOOK_SECRET vazio"
elif [ -z "$EVO_SEC" ]; then
  fail "Evolution: WEBHOOK_GLOBAL_HEADER_APIKEY vazio"
elif [ "$APP_SEC" != "$EVO_SEC" ]; then
  fail "Secrets BATEM FORA — app=$(echo $APP_SEC | head -c 8)... evo=$(echo $EVO_SEC | head -c 8)..."
else
  pass "Secrets idênticos ($(echo $APP_SEC | head -c 8)…)"
fi
echo

# ─── 2. Webhook aceita secret correto → 200 ──────────────────────────────────
echo "[2/5] POST com secret correto → esperado 200…"
if [ -n "$APP_SEC" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST $APP_URL/api/webhooks/evolution \
    -H "apikey: $APP_SEC" \
    -H "Content-Type: application/json" \
    -d '{"event":"ping","instance":"test","data":{"key":{"id":"x","remoteJid":"x","fromMe":true}}}')
  if [ "$CODE" = "200" ]; then
    pass "Webhook aceitou (HTTP 200)"
  else
    fail "Webhook recusou — HTTP $CODE"
  fi
else
  warn "Pulado (sem secret)"
fi
echo

# ─── 3. Webhook bloqueia secret errado → 403 + log CRITICAL ──────────────────
echo "[3/5] POST com secret errado → esperado 403 + log…"
CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST $APP_URL/api/webhooks/evolution \
  -H "apikey: chave-errada-de-proposito-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{"event":"ping"}')
if [ "$CODE" = "403" ]; then
  pass "Webhook bloqueou (HTTP 403)"
else
  fail "Webhook devia ter recusado mas devolveu HTTP $CODE"
fi
sleep 1
if docker logs whatsfrt_app --tail 30 2>&1 | grep -q "CRITICAL.*webhook 403"; then
  pass "Log [CRITICAL] gerado (operador veria isso na hora)"
else
  warn "Log [CRITICAL] não encontrado nas últimas 30 linhas — verifique manualmente: docker logs whatsfrt_app | grep CRITICAL"
fi
echo

# ─── 4. /api/health agregado ─────────────────────────────────────────────────
echo "[4/5] /api/health…"
HEALTH_CODE=$(curl -s -o /tmp/health.json -w "%{http_code}" $APP_URL/api/health)
if [ "$HEALTH_CODE" = "200" ]; then
  pass "health 200 OK"
  cat /tmp/health.json | python3 -m json.tool 2>/dev/null || cat /tmp/health.json
elif [ "$HEALTH_CODE" = "503" ]; then
  warn "health 503 (degraded) — uma dependência fora. Detalhe:"
  cat /tmp/health.json | python3 -m json.tool 2>/dev/null || cat /tmp/health.json
else
  fail "health respondeu HTTP $HEALTH_CODE (esperado 200/503)"
fi
echo

# ─── 5. Workers de reliability ativos ────────────────────────────────────────
echo "[5/5] Workers de reliability ativos no boot?"
LOG_OUT=$(docker logs whatsfrt_app 2>&1 | grep -E "watchdog|queue.*worker|reaper" | head -10)
if [ -n "$LOG_OUT" ]; then
  pass "Workers logaram boot:"
  echo "$LOG_OUT" | sed 's/^/    /'
else
  fail "Nenhum log de worker — instrumentation.ts não rodou? Veja: docker logs whatsfrt_app"
fi
echo

echo "═════════════════════════════════════════════════════════"
if [ $FAILED -eq 0 ]; then
  echo -e "  ${GREEN}TUDO OK — webhook funcionando.${NC}"
  echo "  Manda uma msg do seu celular para o número e veja o chat aparecer."
else
  echo -e "  ${RED}Algo está errado — revise os ❌ acima.${NC}"
fi
echo "═════════════════════════════════════════════════════════"
exit $FAILED

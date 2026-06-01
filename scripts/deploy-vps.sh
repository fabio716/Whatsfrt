#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════════════════════
# WhatsFRT - Script de Deploy Automatizado na VPS
# ═══════════════════════════════════════════════════════════════════════════
# Uso: ./scripts/deploy-vps.sh

echo "🚀 Iniciando deploy na VPS..."

# ─── Verificações ──────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "❌ Arquivo .env não encontrado!"
  echo "   Copie env.production.template para .env e preencha os valores."
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "❌ Docker não instalado!"
  echo "   Execute: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

# ─── Pull das imagens ──────────────────────────────────────────────────────
echo "📦 Baixando imagens Docker..."
docker compose -f docker-compose.prod.yml pull postgres redis evolution_api nginx

# ─── Parar containers antigos ──────────────────────────────────────────────
echo "🛑 Parando containers antigos..."
docker compose -f docker-compose.prod.yml down

# ─── Build Next.js ─────────────────────────────────────────────────────────
echo "🔨 Buildando Next.js..."
docker compose -f docker-compose.prod.yml build app

# ─── Subir containers ──────────────────────────────────────────────────────
echo "🔄 Subindo containers..."
docker compose -f docker-compose.prod.yml up -d

# ─── Aguardar PostgreSQL ───────────────────────────────────────────────────
echo "⏳ Aguardando PostgreSQL..."
sleep 10

# ─── Verificar saúde ───────────────────────────────────────────────────────
echo "🏥 Verificando saúde dos containers..."
docker compose -f docker-compose.prod.yml ps

# ─── Logs ──────────────────────────────────────────────────────────────────
echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📋 Próximos passos:"
echo "   1. Rode as migrations Prisma (da sua máquina local):"
echo "      DATABASE_URL='postgresql://...' npx prisma migrate deploy"
echo ""
echo "   2. Crie o usuário admin:"
echo "      npx tsx scripts/create-admin.ts admin@empresa.com SenhaForte 'Admin'"
echo ""
echo "   3. Acesse a Evolution API:"
echo "      http://SEU_IP:8080"
echo ""
echo "📊 Ver logs em tempo real:"
echo "   docker compose -f docker-compose.prod.yml logs -f"

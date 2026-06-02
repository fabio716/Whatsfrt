#!/bin/bash
# Script de setup inicial da VPS
# Execute este script DENTRO da VPS após conectar via SSH

set -e

echo "🚀 Iniciando setup da VPS..."
echo ""

# 1. Atualizar sistema
echo "📦 Atualizando sistema..."
apt update && apt upgrade -y

# 2. Instalar dependências
echo "📦 Instalando dependências..."
apt install -y curl git

# 3. Instalar Docker
echo "🐳 Instalando Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 4. Instalar Docker Compose
echo "🐳 Instalando Docker Compose..."
apt install -y docker-compose-plugin

# 5. Verificar instalação
echo ""
echo "✅ Verificando instalação..."
docker --version
docker compose version

# 6. Clonar repositório
echo ""
echo "📥 Clonando repositório..."
cd /opt
git clone https://github.com/fabio716/Whatsfrt.git
cd Whatsfrt

echo ""
echo "✅ Setup inicial concluído!"
echo ""
echo "📋 Próximos passos:"
echo "   1. Configurar .env: cp env.production.template .env && nano .env"
echo "   2. Rodar deploy: chmod +x scripts/deploy-vps.sh && ./scripts/deploy-vps.sh"

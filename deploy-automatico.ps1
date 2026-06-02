# ═══════════════════════════════════════════════════════════════════════════
# Deploy Automático VPS - WhatsFRT
# ═══════════════════════════════════════════════════════════════════════════

$VPS_IP = "62.171.178.160"
$VPS_USER = "raiz"
$VPS_PASSWORD = "GV4TAT3WabDQ"

Write-Host "🚀 Iniciando deploy automático na VPS..." -ForegroundColor Green
Write-Host ""

# Criar script de setup remoto
$setupScript = @'
#!/bin/bash
set -e

echo "📦 Atualizando sistema..."
apt update -y

echo "🐳 Instalando Docker..."
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

echo "📦 Instalando dependências..."
apt install -y docker-compose-plugin git

echo "📥 Clonando repositório..."
cd /opt
rm -rf Whatsfrt
git clone https://github.com/fabio716/Whatsfrt.git
cd Whatsfrt

echo "⚙️  Configurando .env..."
cp env.production.template .env

# Gerar senhas fortes
POSTGRES_PASS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
JWT_SECRET=$(openssl rand -hex 32)
EVOLUTION_KEY=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)

# Configurar .env
sed -i "s/GERE_SENHA_FORTE_AQUI_32_CHARS/$POSTGRES_PASS/g" .env
sed -i "s/GERE_SECRET_64_CHARS_HEX_AQUI/$JWT_SECRET/g" .env
sed -i "s/GERE_API_KEY_FORTE_AQUI/$EVOLUTION_KEY/g" .env
sed -i "s/SEU_IP_OU_DOMINIO/62.171.178.160/g" .env

echo ""
echo "✅ Setup concluído!"
echo ""
echo "📋 Credenciais geradas:"
echo "   PostgreSQL: $POSTGRES_PASS"
echo "   JWT Secret: $JWT_SECRET"
echo "   Evolution Key: $EVOLUTION_KEY"
echo ""
echo "🚀 Iniciando deploy..."

chmod +x scripts/deploy-vps.sh
./scripts/deploy-vps.sh

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "🌐 Acesse: http://62.171.178.160"
echo ""
'@

# Salvar script temporário
$setupScript | Out-File -FilePath "setup-remote.sh" -Encoding UTF8 -NoNewline

Write-Host "📤 Enviando script para VPS..." -ForegroundColor Cyan

# Usar plink (PuTTY) se disponível, senão instruções manuais
if (Get-Command plink -ErrorAction SilentlyContinue) {
    Write-Host "Usando plink para conexão..." -ForegroundColor Yellow
    
    # Enviar script
    echo y | plink -ssh -pw $VPS_PASSWORD ${VPS_USER}@${VPS_IP} "cat > /tmp/setup.sh" < setup-remote.sh
    
    # Executar script
    plink -ssh -pw $VPS_PASSWORD ${VPS_USER}@${VPS_IP} "chmod +x /tmp/setup.sh && /tmp/setup.sh"
    
} else {
    Write-Host ""
    Write-Host "⚠️  PuTTY não encontrado. Execute manualmente:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Conecte via SSH:" -ForegroundColor White
    Write-Host "   ssh raiz@62.171.178.160" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Senha:" -ForegroundColor White
    Write-Host "   GV4TAT3WabDQ" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "3. Cole este comando:" -ForegroundColor White
    Write-Host ""
    Write-Host @'
curl -fsSL https://get.docker.com | sh && \
apt install -y docker-compose-plugin git && \
cd /opt && \
git clone https://github.com/fabio716/Whatsfrt.git && \
cd Whatsfrt && \
cp env.production.template .env && \
sed -i "s/GERE_SENHA_FORTE_AQUI_32_CHARS/$(openssl rand -base64 32 | tr -d '=+\/' | cut -c1-32)/g" .env && \
sed -i "s/GERE_SECRET_64_CHARS_HEX_AQUI/$(openssl rand -hex 32)/g" .env && \
sed -i "s/GERE_API_KEY_FORTE_AQUI/$(openssl rand -base64 32 | tr -d '=+\/' | cut -c1-32)/g" .env && \
sed -i "s/SEU_IP_OU_DOMINIO/62.171.178.160/g" .env && \
chmod +x scripts/deploy-vps.sh && \
./scripts/deploy-vps.sh
'@ -ForegroundColor Green
    Write-Host ""
}

# Limpar arquivo temporário
Remove-Item setup-remote.sh -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "✅ Processo iniciado!" -ForegroundColor Green

#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Backup diário do WhatsFRT — banco todo dia, mídias aos domingos.
# Instalar no cron do servidor (como root):
#   crontab -e  →  30 3 * * * /opt/Whatsfrt/scripts/backup-diario.sh >> /root/backups/backup.log 2>&1
# Guarda 14 dias de banco e 4 semanas de mídia em /root/backups.
# IMPORTANTE: backup local protege contra erro/apagão do app, NÃO contra
# perda do servidor inteiro — baixe periodicamente os arquivos de
# /root/backups pro seu computador (ou configure um destino externo).
# ═══════════════════════════════════════════════════════════════════════════
set -u
DEST="/root/backups"
STAMP="$(date +%Y%m%d-%H%M)"
mkdir -p "$DEST"

echo "── $(date '+%d/%m %H:%M') iniciando backup ──"

# 1. Banco (pg_dump comprimido)
if docker exec whatsfrt_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$DEST/db-$STAMP.sql.gz"; then
  echo "banco ok: $(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1)"
else
  echo "ERRO: pg_dump falhou"
  rm -f "$DEST/db-$STAMP.sql.gz"
fi

# 2. Mídias (só aos domingos — arquivo grande)
if [ "$(date +%u)" = "7" ]; then
  if docker exec whatsfrt_app tar czf - -C /app private-uploads > "$DEST/midias-$STAMP.tar.gz"; then
    echo "mídias ok: $(du -h "$DEST/midias-$STAMP.tar.gz" | cut -f1)"
  else
    echo "ERRO: backup de mídias falhou"
    rm -f "$DEST/midias-$STAMP.tar.gz"
  fi
fi

# 3. Rotação: 14 dumps de banco, 4 pacotes de mídia
ls -1t "$DEST"/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "$DEST"/midias-*.tar.gz 2>/dev/null | tail -n +5 | xargs -r rm -f

echo "concluído. em disco: $(du -sh "$DEST" | cut -f1)"

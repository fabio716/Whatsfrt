# ═══════════════════════════════════════════════════════════════════════════
# WhatsFRT - Next.js Production Dockerfile
# ═══════════════════════════════════════════════════════════════════════════

FROM node:20-alpine AS base

# ─── Dependencies ──────────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

# ─── Builder ───────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Runner ────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder /app/prisma ./prisma

# Pasta privada de uploads de mídia. Fica FORA de /app/public para que o
# Next.js não sirva diretamente — todo acesso passa por /api/media com
# auth+ownership. O volume persistente é montado aqui em produção.
RUN mkdir -p /app/private-uploads && chown -R nextjs:nodejs /app/private-uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

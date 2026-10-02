# syntax=docker/dockerfile:1
# =============================================================================
# Grimório de Missões — imagem de produção
#
# Alvo: VPS Hostinger com Docker Manager (Compose from URL) atrás do Traefik
# existente. O fluxo do Render (npm install / npm run build / npm start com
# DATABASE_URL do Supabase) continua funcionando igual e não usa esta imagem.
#
# Duas etapas:
#   1. build   — instala tudo e compila o SPA (Vite) em dist/
#   2. runtime — só o necessário para `node server/index.js`
#
# Base bookworm-slim (glibc) em vez de alpine: o build usa binários nativos de
# esbuild/rollup e o package-lock.json traz as variantes linux-x64 GNU. A base
# glibc elimina o risco de o Vite não achar o binário musl no Alpine.
# =============================================================================

# ---------- etapa 1: build do SPA ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Camada de dependências primeiro (melhor cache entre builds)
COPY package.json package-lock.json ./
RUN npm ci

# Fontes (node_modules e dist ficam de fora pelo .dockerignore)
COPY . .
RUN npm run build

# ---------- etapa 2: runtime ----------
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    GRIMORIO_DATA_DIR=/data \
    GRIMORIO_DAILY_BACKUPS=1 \
    GRIMORIO_BACKUP_RETENTION=30

WORKDIR /app

# Dependências de produção. O projeto mantém tudo em "dependencies" (React,
# Vite etc. só são usados no build), então o npm ci já cobre o runtime:
# express, cors, pg, zod, zod-to-json-schema e @modelcontextprotocol/sdk.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# servidor + módulos compartilhados (server importa src/utils e src/data)
COPY server ./server
COPY src ./src
# O SPA vem da etapa de build — dist/ é ignorado pelo .dockerignore de propósito
COPY --from=build /app/dist ./dist
# Áudio da Câmara do Foco (~41 MB): vive na imagem para não depender do volume.
COPY data/audio ./data/audio

# Volume de dados: database.json, .bak e backups/ ficam aqui, fora da imagem.
RUN mkdir -p /data/backups && chown -R node:node /data
VOLUME ["/data"]

# Nunca como root
USER node

EXPOSE 3000

# /api/health é público (não exige login)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "server/index.js"]

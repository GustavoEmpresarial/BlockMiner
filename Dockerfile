# BlockMiner (current/) — imagem única do backend + frontend.
#
# Bem mais simples que legacy/Dockerfile: sem o split backend/↔server/ (compilação
# dupla via symlink _server_vendor) — current/ é uma árvore TS única, compilada uma vez
# via `npm run build` (tsc -p tsconfig.json).
#
# Estágio `frontend-builder` (client/ via Vite) — igual ao padrão do legacy, adicionado
# quando client/ deixou de estar congelado no legacy/ e passou a viver dentro desta
# árvore. Sem o passo extra do legacy de copiar um `game2048Engine.js` compilado pro
# frontend consumir: current/client/vite.config.ts já resolve `@game2048/engine`
# direto pro arquivo TS fonte (src/features/games/lib/game2048Engine.ts), sem precisar
# de nenhum artefato do backend.
#
# Build: docker compose build app   (ou `docker build .` direto)

# ---- Stage 1: frontend artifacts ----
# Client source in this workspace is incomplete for a fresh Vite build (missing
# client/index.html layout). Ship the prebuilt SPA from client/dist (extracted
# from the last healthy production image / local build).
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/client
COPY client/dist ./dist

# ---- Stage 2: backend artifacts ----
# current/server source tree is incomplete in this workspace (partial modularization).
# Production ships the already-compiled dist from the previous healthy image / local dist/.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY dist ./dist

# ---- Stage 3: runtime (prod deps only) ----
FROM node:22-bookworm-slim
WORKDIR /app
LABEL maintainer="blockminer"

# OpenSSL é exigido pelo Prisma. pg_dump é exigido por admin.backups.service.ts
# (ver docs/PROGRESSO.txt — hoje ausente em dev, aqui fica disponível de verdade).
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openssl ca-certificates netcat-openbsd postgresql-client \
    && update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi

COPY prisma ./prisma/
COPY prisma.config.js ./
RUN npx prisma generate --schema=prisma/schema.prisma

COPY --from=builder /app/dist ./dist

# spaStatic.ts (shared/http/spaStatic.ts) resolves the SPA from <projectRoot>/client/dist —
# same on-disk shape legacy used, so no path override is needed at runtime.
COPY --from=frontend-builder /app/client/dist ./client/dist

# storage/media-seed/ é dado versionado (imagens padrão) que precisa ir na imagem pra
# server/modules/media/media.seed.ts conseguir popular storage/uploads/media/ no primeiro
# boot — sem essa linha o seed só funcionava em dev local (árvore inteira no disco),
# nunca num deploy Docker real. Achado real ao migrar assets/media-seed pra dentro de
# storage/ (ver docs/PROGRESSO.txt).
COPY storage/media-seed ./storage/media-seed

# storage/ consolida uploads+backups (ver docs/PROGRESSO.txt item 9b) — um volume
# só, em vez dos data/backups/uploads separados que o legacy monta.
RUN mkdir -p storage/uploads storage/backups

ENV NODE_ENV=production
EXPOSE 3000

COPY docker-entrypoint.sh /usr/local/bin/
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && \
    chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server/bootstrap/server.js"]

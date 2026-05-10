# syntax=docker/dockerfile:1.7

# ── Dependencies (incl. dev) for build ────────────────────────────────────
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# better-sqlite3 ships prebuilt binaries via prebuild-install; npm ci picks
# the right one for the target platform without needing build tools.
RUN npm ci

# ── Build .next/ ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime image ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# ffmpeg is needed for transcoding user uploads (importer also uses ffprobe).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN groupadd -g 1001 app && useradd -u 1001 -g app -m app

COPY --from=builder --chown=app:app /app/.next             ./.next
COPY --from=builder --chown=app:app /app/public            ./public
COPY --from=builder --chown=app:app /app/node_modules      ./node_modules
COPY --from=builder --chown=app:app /app/package.json      ./package.json
COPY --from=builder --chown=app:app /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=app:app /app/next.config.js    ./next.config.js
COPY --from=builder --chown=app:app /app/scripts           ./scripts

USER app
EXPOSE 3010
ENV PORT=3010
ENV DATA_DIR=/app/data
CMD ["sh", "-c", "node scripts/auto-import-watcher.mjs & exec npm start"]

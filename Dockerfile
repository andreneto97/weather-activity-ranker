# syntax=docker/dockerfile:1.7
# Multi-stage build: one artifact serving both the compiled Node backend
# and the built Vite frontend. See specs/00-overview.spec.md §Deployment.

# ---------- 1. Base with pnpm ----------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

# ---------- 2. Deps layer (cached on lockfile changes only) ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/web/package.json ./packages/web/
COPY packages/contracts/package.json ./packages/contracts/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

# ---------- 3. Build ----------
FROM deps AS build
COPY tsconfig.base.json biome.json ./
COPY packages ./packages
# Contracts first (schema + codegen); then per-package builds
RUN pnpm --filter @wa/server build:schema \
  && pnpm --filter @wa/contracts codegen \
  && pnpm --filter @wa/server build \
  && pnpm --filter @wa/web build

# ---------- 4. Prune to production deps ----------
FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/server/package.json ./packages/server/
COPY packages/contracts/package.json ./packages/contracts/
# Only the server + contracts run at runtime; web is a static bundle served by
# fastify-static, so no runtime deps needed for it.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod \
  --filter @wa/server --filter @wa/contracts

# ---------- 5. Runtime ----------
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

# Compiled server + its production deps
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=prod-deps --chown=app:app /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=build --chown=app:app /app/packages/server/dist ./packages/server/dist
COPY --from=build --chown=app:app /app/packages/server/package.json ./packages/server/package.json

# Contracts is used at runtime (schema.graphql + minimal src)
COPY --from=build --chown=app:app /app/packages/contracts ./packages/contracts

# Static SPA bundle served by fastify-static (see main.ts prod-only branch)
COPY --from=build --chown=app:app /app/packages/web/dist ./packages/web/dist

USER app
EXPOSE 8080

# Healthcheck hits Fastify's /health route (rate-limited disabled for probes).
# Uses Node 22's built-in fetch instead of `wget` so the base image needs no
# extra shell utilities — smaller attack surface if the container is ever
# compromised (no fetch-capable primitives left to exfil data).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# main.ts serves both /graphql and the SPA when NODE_ENV=production.
CMD ["node", "packages/server/dist/main.js"]

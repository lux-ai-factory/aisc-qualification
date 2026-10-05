# Multi-stage build: install dependencies, build the Next.js app, then run it with `next start`.
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
# .npmrc: strict peer resolution (it held legacy-peer-deps while react was an RC).
COPY package.json package-lock.json* .npmrc ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Path prefix the app is served under (e.g. /qualification behind Caddy). Empty means the root.
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3000
# `next start` evaluates next.config.ts again at runtime, which derives basePath from
# NEXT_BASE_PATH. Build ARG/ENV do not cross stages, so it is declared again here;
# without it the app serves at the root and Caddy's /qualification* route returns 404.
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
# `prisma db seed` runs in this stage (package.json "prisma.seed"), so the seed
# script and the ontology example it reads must be copied in too.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/services/ontology/examples ./services/ontology/examples
# next.config.ts (and tsconfig.json, to load it) must be present for the runtime
# evaluation of basePath described above.
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
USER app
EXPOSE 3000
# No schema step here: scripts/migrate-projects.mjs (the qualification-migrate one-shot)
# migrates every project database, and the app migrates a new one the first time it opens it.
CMD ["npx", "next", "start", "-p", "3000"]

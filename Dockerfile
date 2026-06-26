# Multi-stage build for Next.js standalone output
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Path-prefix routing (e.g. /qualification behind Caddy). Empty = served at root.
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH
# Keycloak URL baked into the client bundle at build time (Next inlines NEXT_PUBLIC_* during build).
# Empty -> the app falls back to its dev default (http://localhost:8081). Set to the real URL for prod.
ARG NEXT_PUBLIC_KEYCLOAK_URL=""
ENV NEXT_PUBLIC_KEYCLOAK_URL=$NEXT_PUBLIC_KEYCLOAK_URL
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3000
# `next start` re-evaluates next.config.ts at runtime, which derives basePath from
# NEXT_BASE_PATH. Build ARG/ENV don't cross stages, so re-declare it here; without
# this the baked /qualification prefix is dropped and the app serves at root
# (Caddy's /qualification* route then 404s).
ARG NEXT_BASE_PATH=""
ENV NEXT_BASE_PATH=$NEXT_BASE_PATH
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
# next.config.ts (and tsconfig to load the .ts) must be present so the runtime
# re-evaluation above can re-apply basePath.
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
USER app
EXPOSE 3000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx next start -p 3000"]

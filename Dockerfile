# ── Build ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Prisma needs openssl at build time for engine binaries on alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
RUN apk add --no-cache openssl && addgroup -S leonyx && adduser -S leonyx -G leonyx

COPY --from=build --chown=leonyx:leonyx /app/node_modules ./node_modules
COPY --from=build --chown=leonyx:leonyx /app/.next ./.next
COPY --from=build --chown=leonyx:leonyx /app/public ./public
COPY --from=build --chown=leonyx:leonyx /app/package.json ./package.json
COPY --from=build --chown=leonyx:leonyx /app/prisma ./prisma
COPY --from=build --chown=leonyx:leonyx /app/next.config.mjs ./next.config.mjs
COPY --from=build --chown=leonyx:leonyx /app/node_modules/.prisma ./node_modules/.prisma

USER leonyx
EXPOSE 3000

# Default: web server. Override CMD to run the worker:
#   docker run leonyx-flow bash -c "node node_modules/tsx/dist/cli.mjs src/worker/index.ts"
CMD ["npm", "start"]
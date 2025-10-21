# --- Base ---
FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Deps ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- Build ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build   # produces .next/standalone and .next/static

# --- Run ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

# Non-root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
USER nextjs

# ✅ Copy the server bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# ✅ ALSO copy client/static & public assets (critical!)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

EXPOSE 8080
CMD ["node", "server.js"]

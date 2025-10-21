# Dockerfile for a Next.js application for Google Cloud Run

# 1. Installer Stage: Install dependencies
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Builder Stage: Build the Next.js application
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Set build-time arguments
ARG NEXT_PUBLIC_GCP_PROJECT_ID
ARG NEXT_PUBLIC_GCP_REGION
# Env variables needed for build
ENV NEXT_PUBLIC_GCP_PROJECT_ID=${NEXT_PUBLIC_GCP_PROJECT_ID}
ENV NEXT_PUBLIC_GCP_REGION=${NEXT_PUBLIC_GCP_REGION}
# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# 3. Runner Stage: Create the final, minimal production image
FROM node:18-alpine AS runner
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Set the user to the non-root user
USER nextjs

# Expose the port the app will run on
EXPOSE 3000

# Set the default command to start the application
CMD ["node", "server.js"]

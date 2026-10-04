# ==============================================================================
# RescueNet API Multi-Stage Non-Root Production Dockerfile
# ==============================================================================

# Stage 1: Build Dependencies
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core ./packages/core
COPY services/api ./services/api

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rescuenet/core build
RUN pnpm --filter @rescuenet/api build
RUN pnpm --filter @rescuenet/api --prod deploy pruned-api

# Stage 2: Minimal Non-Root Production Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install dumb-init for proper PID 1 signal forwarding
RUN apk add --no-cache dumb-init

# Copy built runtime assets with proper node ownership
COPY --chown=node:node --from=builder /app/pruned-api /app
COPY --chown=node:node --from=builder /app/services/api/migrations /app/migrations

# Switch to unprivileged non-root user
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/index.js"]

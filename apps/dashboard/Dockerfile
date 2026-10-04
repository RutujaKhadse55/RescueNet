# ==============================================================================
# RescueNet Dashboard Multi-Stage Non-Root Production Dockerfile
# ==============================================================================

# Stage 1: Build Web Application
FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/core ./packages/core
COPY apps/dashboard ./apps/dashboard

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rescuenet/core build
RUN pnpm --filter @rescuenet/dashboard build

# Stage 2: Serve via Unprivileged Nginx
FROM nginxinc/nginx-unprivileged:alpine AS runner

COPY --chown=nginx:nginx --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
COPY --chown=nginx:nginx apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]

# Flower Lantern Spa — backend (NestJS). Built for Azure App Service for Containers (Linux, F1 free tier).
# Multi-stage: builder installs the whole npm workspace (so TypeORM/entities resolve) and compiles;
# runtime stage ships only backend/dist + backend's own production node_modules.
#
# Why Docker instead of App Service's built-in Oryx/code deploy: this repo is an npm workspace
# (root package.json has "workspaces": ["backend", "frontend"]); Oryx expects package.json at the
# deployed root and does not understand workspaces. Docker also lets us control exactly which base
# image and native toolchain build msnodesqlv8 (Windows-only optional dependency) against — on this
# Linux image its install is simply skipped (optionalDependencies), which is the intended behavior:
# that driver is only used for DB_AUTH=windows, which config.ts refuses outright in production.

FROM node:22-bookworm-slim AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
# root package.json lists "frontend" as a workspace too; npm needs that package.json present to
# validate package-lock.json even though this image never builds or ships frontend source.
COPY frontend/package.json frontend/package.json
RUN npm ci --workspace backend --include-workspace-root
COPY backend ./backend
RUN npm run build --workspace backend

# Production-only dependencies for the backend workspace (no TypeScript, Jest, ESLint, Playwright).
FROM node:22-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci --omit=dev --workspace backend && npm cache clean --force

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /repo/backend/package.json ./package.json
COPY --from=builder /repo/backend/dist ./dist
COPY --from=deps /repo/node_modules ./node_modules
# Azure App Service for Containers sets PORT at runtime and expects the container to listen on 0.0.0.0.
ENV HOST=0.0.0.0
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]

# ---------------------------------------------------------------------------
# Build stage: full toolchain, produces the client bundle and the server bundle.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so the dependency layer is cached until a dependency actually
# changes rather than on every source edit.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY . .
# Typechecks all three workspaces, then builds the client and bundles the server.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime stage: plain Node, production dependencies only, no TypeScript.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Only the server's runtime dependencies (express, cors) — installed from the
# lockfile so the image is reproducible.
RUN npm ci --omit=dev --workspace server --include-workspace-root \
  && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY data ./data

ENV PORT=4000
EXPOSE 4000
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Direct exec, no npm wrapper, so the process gets SIGTERM and can drain.
CMD ["node", "server/dist/index.js"]

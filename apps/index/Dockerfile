# Identizen index — self-host image.
# Runs the same Worker that Cloudflare runs, inside workerd (via wrangler) in a container:
# Durable Objects, Hyperdrive-style Postgres access, and the OIDC provider all behave identically.
#
#   docker compose up            # from the repo root (see docker-compose.yml)
#
# Build context is the repository root.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY db/package.json db/
COPY apps/index/package.json apps/index/
RUN npm ci --workspace @identizen/index --workspace @identizen/db --workspace @identizen/protocol --include-workspace-root
COPY packages/protocol packages/protocol
COPY db db
COPY apps/index apps/index
COPY spec spec
RUN npm run build -w @identizen/protocol && npm run build -w @identizen/db

FROM node:22-bookworm-slim
WORKDIR /repo
COPY --from=build /repo /repo
ENV NODE_ENV=production \
    PORT=8787 \
    WRANGLER_SEND_METRICS=false
VOLUME ["/data"]
EXPOSE 8787
COPY apps/index/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && apt-get update && apt-get install -y --no-install-recommends wget ca-certificates && rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/entrypoint.sh"]

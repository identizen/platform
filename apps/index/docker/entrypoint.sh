#!/bin/sh
# Self-host entrypoint: configure from environment variables only, migrate, run the Worker in workerd.
set -eu
cd /repo/apps/index

: "${DATABASE_URL:?DATABASE_URL is required (postgres://user:pass@host:5432/db)}"
: "${INDEX_URL:?INDEX_URL is required (public URL of this index, e.g. https://index.example.com)}"
: "${INDEX_SIGNING_KEY:?INDEX_SIGNING_KEY is required (32-byte hex; generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")}"
: "${OIDC_SIGNING_KEYS:?OIDC_SIGNING_KEYS is required (JSON array of ES256 private JWKs; generate with: npm run keys -w @identizen/index)}"

# wrangler reads local secrets/vars from .dev.vars; .dev.vars overrides the vars in wrangler.jsonc.
{
  echo "INDEX_URL=${INDEX_URL}"
  echo "APP_URL=${APP_URL:-$INDEX_URL}"
  echo "INDEX_SIGNING_KEY=${INDEX_SIGNING_KEY}"
  echo "OIDC_SIGNING_KEYS=${OIDC_SIGNING_KEYS}"
  echo "PUSH_PROVIDER=${PUSH_PROVIDER:-web}"
  echo "OPEN_SITE_REGISTRATION=${OPEN_SITE_REGISTRATION:-false}"
  echo "SITE_REGISTRATION_TOKEN=${SITE_REGISTRATION_TOKEN:-}"
  echo "DASHBOARD_CLIENT_IDS=${DASHBOARD_CLIENT_IDS:-}"
  for v in APNS_KEY_ID APNS_TEAM_ID APNS_PRIVATE_KEY APNS_TOPIC APNS_SANDBOX FCM_PROJECT_ID FCM_SERVICE_ACCOUNT VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT; do
    eval "val=\${$v:-}"
    [ -n "$val" ] && echo "$v=$val"
  done
} > .dev.vars.dev

echo "[identizen] applying database migrations"
DATABASE_URL="$DATABASE_URL" node /repo/db/dist/src/cli-migrate.js

export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="$DATABASE_URL"
echo "[identizen] starting index at ${INDEX_URL} (port ${PORT})"
exec npx wrangler dev --env dev --ip 0.0.0.0 --port "$PORT" --persist-to /data --show-interactive-dev-session=false

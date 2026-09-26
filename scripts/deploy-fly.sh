#!/usr/bin/env bash
# Deploy Oakdale Men's Softball to Fly.io with a lasting HTTPS hostname.
#
# Required:
#   FLY_API_TOKEN   — https://fly.io/dashboard/personal/tokens
#   ADMIN_EMAIL
#   ADMIN_PASSWORD
#
# Optional:
#   ADMIN_NAME      — default: League Commissioner
#   SESSION_SECRET  — generated if omitted
#   FLY_APP         — default: oakdale-mens-softball (from fly.toml)
#   FLY_ORG         — default: personal
#   FLY_REGION      — default: iad
#   IMPORT_DB       — path to a league.db to copy onto the volume after deploy
#
# Usage (from repo root):
#   FLY_API_TOKEN=... ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='...' \
#     ./scripts/deploy-fly.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v flyctl >/dev/null 2>&1 && ! command -v fly >/dev/null 2>&1; then
  echo "flyctl is not installed. See https://fly.io/docs/flyctl/install/" >&2
  exit 1
fi

FLY=(flyctl)
if ! command -v flyctl >/dev/null 2>&1; then
  FLY=(fly)
fi

if [[ -z "${FLY_API_TOKEN:-}" ]]; then
  echo "FLY_API_TOKEN is required. Create a deploy token at https://fly.io/dashboard/personal/tokens" >&2
  exit 1
fi

if [[ -z "${ADMIN_EMAIL:-}" || -z "${ADMIN_PASSWORD:-}" ]]; then
  echo "ADMIN_EMAIL and ADMIN_PASSWORD are required for the first deploy." >&2
  exit 1
fi

APP="${FLY_APP:-oakdale-mens-softball}"
ORG="${FLY_ORG:-personal}"
REGION="${FLY_REGION:-iad}"
ADMIN_NAME="${ADMIN_NAME:-League Commissioner}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -hex 32)}"

echo "==> Using app ${APP} in ${ORG} (${REGION})"

if ! "${FLY[@]}" status --app "$APP" >/dev/null 2>&1; then
  echo "==> Creating app ${APP}"
  if ! "${FLY[@]}" apps create "$APP" --org "$ORG"; then
    echo "Could not create ${APP}. It may already be taken — set FLY_APP to another name." >&2
    exit 1
  fi
else
  echo "==> App ${APP} already exists"
fi

VOLUME_JSON="$("${FLY[@]}" volumes list --app "$APP" --json 2>/dev/null || echo "[]")"
if ! echo "$VOLUME_JSON" | grep -q '"name": "oakdale_data"'; then
  echo "==> Creating volume oakdale_data"
  "${FLY[@]}" volumes create oakdale_data --size 1 --region "$REGION" --app "$APP" --yes
else
  echo "==> Volume oakdale_data already exists"
fi

echo "==> Setting secrets (values are not printed)"
"${FLY[@]}" secrets set --app "$APP" --stage \
  "ADMIN_EMAIL=${ADMIN_EMAIL}" \
  "ADMIN_NAME=${ADMIN_NAME}" \
  "ADMIN_PASSWORD=${ADMIN_PASSWORD}" \
  "SESSION_SECRET=${SESSION_SECRET}"

echo "==> Deploying (remote builder, one machine)"
"${FLY[@]}" deploy --remote-only --ha=false --yes --app "$APP"

if [[ -n "${IMPORT_DB:-}" ]]; then
  if [[ ! -f "$IMPORT_DB" ]]; then
    echo "IMPORT_DB=${IMPORT_DB} is not a file" >&2
    exit 1
  fi
  echo "==> Uploading ${IMPORT_DB} to /data/league.db"
  "${FLY[@]}" ssh sftp put --app "$APP" "$IMPORT_DB" /data/league.db
  if [[ -f "${IMPORT_DB}-wal" ]]; then
    "${FLY[@]}" ssh sftp put --app "$APP" "${IMPORT_DB}-wal" /data/league.db-wal
  fi
  if [[ -f "${IMPORT_DB}-shm" ]]; then
    "${FLY[@]}" ssh sftp put --app "$APP" "${IMPORT_DB}-shm" /data/league.db-shm
  fi
  echo "==> Restarting after database import"
  "${FLY[@]}" machines restart --app "$APP"
fi

HOSTNAME="${APP}.fly.dev"
STATUS_JSON="$("${FLY[@]}" status --app "$APP" --json 2>/dev/null || true)"
if [[ -n "$STATUS_JSON" ]]; then
  PARSED="$(python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    raise SystemExit(0)
print(d.get("Hostname") or d.get("hostname") or "")
' <<<"$STATUS_JSON" || true)"
  if [[ -n "$PARSED" ]]; then
    HOSTNAME="$PARSED"
  fi
fi

echo
echo "HTTPS URL: https://${HOSTNAME}"
echo "Health:    https://${HOSTNAME}/api/health"
echo "Sign in:   ${ADMIN_EMAIL}"
echo
echo "Save this URL — phones and the App Store need it to stay the same."

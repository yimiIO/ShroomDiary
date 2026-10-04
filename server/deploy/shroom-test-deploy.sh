#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT=/www/wwwroot/shroom
INCOMING_ROOT=/var/lib/shroom-deploy/incoming
SERVICE=shroom-api
LOCAL_HEALTH=http://127.0.0.1:3102/api/health
PUBLIC_HEALTH=https://shroom.evox.run/api/health
ARCHIVE=${1:-}
REVISION=${2:-}

if [[ -z "$ARCHIVE" || -z "$REVISION" ]]; then
  echo "usage: shroom-test-deploy <archive> <revision>" >&2
  exit 64
fi

case "$ARCHIVE" in
  "$INCOMING_ROOT"/*.tgz) ;;
  *) echo "archive must be inside $INCOMING_ROOT" >&2; exit 65 ;;
esac

[[ "$REVISION" =~ ^[0-9a-f]{7,40}$ ]] || { echo "invalid revision" >&2; exit 65; }
[[ -f "$ARCHIVE" ]] || { echo "archive not found" >&2; exit 66; }

exec 9>/run/lock/shroom-test-deploy.lock
flock -n 9 || { echo "another deployment is running" >&2; exit 75; }

if tar -tzf "$ARCHIVE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  echo "unsafe archive paths" >&2
  exit 65
fi
tar -tzf "$ARCHIVE" | grep -qx 'public/index.html' || { echo "public/index.html missing" >&2; exit 65; }
tar -tzf "$ARCHIVE" | grep -qx 'server/package.json' || { echo "server/package.json missing" >&2; exit 65; }

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE_ID="${STAMP}-${REVISION:0:12}"
STAGING="$APP_ROOT/releases/.staging-$RELEASE_ID"
BACKUP="$APP_ROOT/backups/auto-$RELEASE_ID"
FAILED="$APP_ROOT/releases/failed-$RELEASE_ID"

mkdir -p "$APP_ROOT/releases" "$APP_ROOT/backups" "$STAGING" "$BACKUP"
tar -xzf "$ARCHIVE" -C "$STAGING"

npm --prefix "$STAGING/server" ci --omit=dev --no-audit --no-fund
set -a
. /etc/shroom/shroom.env
[[ -f /etc/shroom/cos.env ]] && . /etc/shroom/cos.env
[[ -f /etc/shroom/mail.env ]] && . /etc/shroom/mail.env
set +a
node "$STAGING/server/scripts/run-sql-migrations.js"

chown -R root:shroom "$STAGING/server"
chmod -R g+rX "$STAGING/server"
chown -R root:root "$STAGING/public"
chmod -R a+rX "$STAGING/public"

rollback() {
  set +e
  systemctl stop "$SERVICE"
  [[ -d "$APP_ROOT/server" ]] && mv "$APP_ROOT/server" "$FAILED-server"
  [[ -d "$APP_ROOT/public" ]] && mv "$APP_ROOT/public" "$FAILED-public"
  [[ -d "$BACKUP/server" ]] && mv "$BACKUP/server" "$APP_ROOT/server"
  [[ -d "$BACKUP/public" ]] && mv "$BACKUP/public" "$APP_ROOT/public"
  systemctl start "$SERVICE"
  curl -fsS --max-time 10 "$LOCAL_HEALTH" >/dev/null
}
trap 'echo "deployment failed; restoring previous release" >&2; rollback' ERR

systemctl stop "$SERVICE"
mv "$APP_ROOT/server" "$BACKUP/server"
mv "$APP_ROOT/public" "$BACKUP/public"
mv "$STAGING/server" "$APP_ROOT/server"
mv "$STAGING/public" "$APP_ROOT/public"
systemctl start "$SERVICE"

for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 "$LOCAL_HEALTH" >/dev/null; then break; fi
  sleep 1
done
curl -fsS --max-time 10 "$LOCAL_HEALTH" >/dev/null
curl -fsS --max-time 15 "$PUBLIC_HEALTH" >/dev/null

trap - ERR
printf '%s\n' "$REVISION" > "$APP_ROOT/DEPLOYED_REVISION"
printf '%s\n' "$RELEASE_ID" > "$APP_ROOT/DEPLOYED_RELEASE"
rm -f "$ARCHIVE"
rmdir "$STAGING" 2>/dev/null || true
echo "deployed $RELEASE_ID"

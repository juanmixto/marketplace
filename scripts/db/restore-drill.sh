#!/usr/bin/env bash
# Restore drill — pulls the latest encrypted dump from B2 into an ephemeral
# Postgres container, restores it, and validates a known table.
#
# Run monthly. If this script ever fails, the backup is theoretical.
#
# Required env (or .env file in the same dir):
#   MP_DUMP_PASSPHRASE_FILE   path to file with the gpg passphrase
#   B2_REMOTE                 rclone remote, e.g. "b2-mp"
#   B2_BUCKET                 e.g. "mp-dumps-eu"
#   B2_PREFIX                 prefix inside bucket, default "daily"
#
# Optional env:
#   PG_TEST_PORT              host port for the test container, default 5433
#   PG_TEST_NAME              container name, default mp-restore-drill
#   EXPECTED_MIN_ORDERS       lower bound on Order rows; drill fails if below.
#                             Default 0 (any non-negative passes).
#
# Refs: docs/runbooks/db-restore.md, issue #1010

set -euo pipefail

: "${MP_DUMP_PASSPHRASE_FILE:?MP_DUMP_PASSPHRASE_FILE not set}"
: "${B2_REMOTE:?B2_REMOTE not set}"
: "${B2_BUCKET:?B2_BUCKET not set}"

B2_PREFIX="${B2_PREFIX:-daily}"
PG_TEST_PORT="${PG_TEST_PORT:-5433}"
PG_TEST_NAME="${PG_TEST_NAME:-mp-restore-drill}"
EXPECTED_MIN_ORDERS="${EXPECTED_MIN_ORDERS:-0}"

WORKDIR="$(mktemp -d -t mp-restore-drill.XXXXXX)"
trap 'rm -rf "$WORKDIR"; docker rm -f "$PG_TEST_NAME" >/dev/null 2>&1 || true' EXIT

START_EPOCH="$(date +%s)"
echo "[$(date -Is)] drill start"

# 1. Find latest dump on B2
echo "[$(date -Is)] querying $B2_REMOTE:$B2_BUCKET/$B2_PREFIX"
LATEST="$(rclone lsf "$B2_REMOTE:$B2_BUCKET/$B2_PREFIX" --files-only \
  | grep -E '\.dump\.gpg$' \
  | sort \
  | tail -n1)"
if [[ -z "$LATEST" ]]; then
  echo "no dumps found in $B2_REMOTE:$B2_BUCKET/$B2_PREFIX" >&2
  exit 1
fi
echo "[$(date -Is)] latest = $LATEST"

# 2. Download
ENC_FILE="$WORKDIR/$LATEST"
rclone copyto "$B2_REMOTE:$B2_BUCKET/$B2_PREFIX/$LATEST" "$ENC_FILE"

# 3. Decrypt
DUMP_FILE="$WORKDIR/${LATEST%.gpg}"
echo "[$(date -Is)] decrypting"
gpg --batch --yes \
    --passphrase-file "$MP_DUMP_PASSPHRASE_FILE" \
    --decrypt --output "$DUMP_FILE" \
    "$ENC_FILE"

# 4. Spin ephemeral postgres
echo "[$(date -Is)] launching $PG_TEST_NAME on :$PG_TEST_PORT"
docker rm -f "$PG_TEST_NAME" >/dev/null 2>&1 || true
docker run --rm -d \
  --name "$PG_TEST_NAME" \
  -e POSTGRES_PASSWORD=drill \
  -p "${PG_TEST_PORT}:5432" \
  postgres:16-alpine >/dev/null

# Wait for ready (max 60s)
for i in $(seq 1 30); do
  if docker exec "$PG_TEST_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$PG_TEST_NAME" pg_isready -U postgres >/dev/null

# 5. Restore
echo "[$(date -Is)] creating db marketplace_restore"
docker exec "$PG_TEST_NAME" psql -U postgres -c "CREATE DATABASE marketplace_restore;" >/dev/null

echo "[$(date -Is)] pg_restore"
docker cp "$DUMP_FILE" "$PG_TEST_NAME:/tmp/dump.bin"
docker exec "$PG_TEST_NAME" \
  pg_restore -U postgres -d marketplace_restore \
  --no-owner --no-privileges \
  /tmp/dump.bin

# 6. Validate
ORDERS="$(docker exec "$PG_TEST_NAME" psql -U postgres -d marketplace_restore -tAc 'SELECT COUNT(*) FROM "Order";')"
ORDERS="${ORDERS//[[:space:]]/}"
echo "[$(date -Is)] Order rows = $ORDERS"

if ! [[ "$ORDERS" =~ ^[0-9]+$ ]]; then
  echo "FAIL: SELECT COUNT did not return an integer" >&2
  exit 1
fi
if (( ORDERS < EXPECTED_MIN_ORDERS )); then
  echo "FAIL: $ORDERS rows < EXPECTED_MIN_ORDERS=$EXPECTED_MIN_ORDERS" >&2
  exit 1
fi

END_EPOCH="$(date +%s)"
ELAPSED=$(( END_EPOCH - START_EPOCH ))
echo "[$(date -Is)] DRILL OK — ${ELAPSED}s end-to-end, $ORDERS Order rows"
echo "$(date -Is) ok elapsed_s=$ELAPSED orders=$ORDERS dump=$LATEST" \
  >> "${DRILL_LOG:-/var/log/marketplace/restore-drill.log}" 2>/dev/null || true

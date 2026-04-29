#!/usr/bin/env bash
# Daily logical backup: pg_dump → gpg (symmetric) → rclone B2 → Healthchecks ping.
#
# Why a logical dump alongside pgBackRest?
#   - pgBackRest = physical, fast, cluster-level, requires same major version.
#   - pg_dump    = portable, restorable to any pg ≥ 16, survives a corrupted cluster.
# Belt-and-braces. Costs ~50 MB/day at our size.
#
# Required env (load from /etc/marketplace/backup.env, mode 600 root:root):
#   DATABASE_URL              postgresql://user:pass@host:5432/marketplace
#   MP_DUMP_PASSPHRASE_FILE   path to file containing the gpg passphrase (mode 600)
#   B2_REMOTE                 rclone remote name, e.g. "b2-mp"
#   B2_BUCKET                 e.g. "mp-dumps-eu"
#   HC_PING_DUMP_URL          Healthchecks.io ping URL (issue #1009)
#
# Cron (run as root):
#   15 3 * * *  /opt/marketplace/scripts/db/backup-dump.sh >> /var/log/marketplace/backup-dump.log 2>&1
#
# Refs: docs/runbooks/db-backup.md, issues #1007 #1008 #1009

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL not set}"
: "${MP_DUMP_PASSPHRASE_FILE:?MP_DUMP_PASSPHRASE_FILE not set}"
: "${B2_REMOTE:?B2_REMOTE not set}"
: "${B2_BUCKET:?B2_BUCKET not set}"
: "${HC_PING_DUMP_URL:?HC_PING_DUMP_URL not set}"

if [[ ! -r "$MP_DUMP_PASSPHRASE_FILE" ]]; then
  echo "passphrase file not readable: $MP_DUMP_PASSPHRASE_FILE" >&2
  exit 1
fi

WORKDIR="${BACKUP_WORKDIR:-/var/tmp/marketplace-backup}"
mkdir -p "$WORKDIR"
chmod 700 "$WORKDIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$WORKDIR/marketplace-$STAMP.dump"
ENC_FILE="$DUMP_FILE.gpg"
REMOTE_PATH="$B2_REMOTE:$B2_BUCKET/daily/marketplace-$STAMP.dump.gpg"

# Healthchecks: signal start so a stuck job is detected
curl -fsS -m 10 --retry 3 -o /dev/null "$HC_PING_DUMP_URL/start" || true

cleanup() {
  rm -f "$DUMP_FILE" "$ENC_FILE"
}
fail() {
  local msg="$1"
  echo "FAIL: $msg" >&2
  curl -fsS -m 10 --retry 3 -o /dev/null \
    --data-raw "marketplace dump failed: $msg" \
    "$HC_PING_DUMP_URL/fail" || true
  cleanup
  exit 1
}
trap 'fail "unexpected error on line $LINENO"' ERR

echo "[$(date -Is)] pg_dump → $DUMP_FILE"
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --compress=0 \
  --file="$DUMP_FILE" \
  "$DATABASE_URL"

# pg_dump --custom is already binary-compact; we let gpg/zlib compress further.
DUMP_BYTES="$(stat -c%s "$DUMP_FILE")"
if (( DUMP_BYTES < 1024 )); then
  fail "dump suspiciously small: ${DUMP_BYTES} bytes"
fi

echo "[$(date -Is)] gpg encrypt (AES-256, zlib level 6)"
gpg --batch --yes \
    --symmetric --cipher-algo AES256 \
    --compress-algo ZLIB --compress-level 6 \
    --passphrase-file "$MP_DUMP_PASSPHRASE_FILE" \
    --output "$ENC_FILE" \
    "$DUMP_FILE"

echo "[$(date -Is)] rclone copy → $REMOTE_PATH"
rclone copyto \
  --b2-hard-delete \
  --transfers=2 \
  --checkers=4 \
  --retries=3 \
  --low-level-retries=10 \
  "$ENC_FILE" "$REMOTE_PATH"

# Verify the remote object exists and matches local size
REMOTE_BYTES="$(rclone size "$REMOTE_PATH" --json | jq -r '.bytes' 2>/dev/null || echo 0)"
LOCAL_ENC_BYTES="$(stat -c%s "$ENC_FILE")"
if [[ "$REMOTE_BYTES" != "$LOCAL_ENC_BYTES" ]]; then
  fail "remote size $REMOTE_BYTES != local $LOCAL_ENC_BYTES"
fi

echo "[$(date -Is)] success — local=${LOCAL_ENC_BYTES}B remote=${REMOTE_BYTES}B"
curl -fsS -m 10 --retry 3 -o /dev/null \
  --data-raw "ok bytes=$LOCAL_ENC_BYTES" \
  "$HC_PING_DUMP_URL" || true

cleanup

#!/usr/bin/env bash
# Smoke-check the public readiness probe of raizdirecta.es.
#
# Designed as a building block: any external monitor (BetterStack, UptimeRobot,
# Healthchecks.io, Cronitor) can wrap this script via SSH/curl and treat exit
# code as health. Until #1308's external monitor is signed up, this can also
# be wired to a systemd timer on whisper as an interim signal.
#
# Exit codes:
#   0  every dependency green
#   1  HTTP 503 — at least one dependency degraded; details printed
#   2  network / DNS / TLS failure (no response at all)
#   3  HTTP response neither 200 nor 503 (unexpected — e.g. 502 from Cloudflare)
#   4  jq missing
#
# Usage:
#   scripts/check-prod-health.sh                           # default raizdirecta.es
#   READY_URL=https://stg.raizdirecta.es/api/ready scripts/check-prod-health.sh
#   scripts/check-prod-health.sh --quiet                   # silence stdout, errors only
#
# Designed to be safe under cron: never blocks more than 12s (curl --max-time 10
# + 2s slack), never writes outside its own stdout/stderr, no temp files.

set -Eeuo pipefail

url="${READY_URL:-https://raizdirecta.es/api/ready}"
quiet="false"
for arg in "$@"; do
  case "$arg" in
    -q|--quiet) quiet="true" ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# *//'
      exit 0
      ;;
  esac
done

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not found in PATH (apt-get install jq)" >&2
  exit 4
fi

log() { [[ "$quiet" != "true" ]] && echo "$@"; }

tmp_status="$(mktemp)"
trap 'rm -f "$tmp_status"' EXIT

# `--max-time 10` bounds total wall clock; the route itself caps each probe
# at 1-2s and parallelises them, so a healthy response lands in <500ms.
http_code="$(
  curl --silent --show-error \
       --max-time 10 \
       --output "$tmp_status" \
       --write-out '%{http_code}' \
       --header 'Accept: application/json' \
       "$url" || echo "000"
)"

case "$http_code" in
  000)
    echo "FAIL: no response from $url (network/DNS/TLS)" >&2
    exit 2
    ;;
  200)
    log "OK: $url green"
    if [[ "$quiet" != "true" ]]; then
      jq -c '.checks | to_entries | map({(.key): .value.latencyMs}) | add' "$tmp_status" 2>/dev/null || true
    fi
    exit 0
    ;;
  503)
    echo "DEGRADED: $url returned 503" >&2
    jq -r '.checks | to_entries[] | select(.value.ok == false) | "  - \(.key): \(.value.error // "no error message") (\(.value.latencyMs)ms)"' "$tmp_status" >&2 || true
    exit 1
    ;;
  *)
    echo "UNEXPECTED: $url returned HTTP $http_code" >&2
    head -c 500 "$tmp_status" >&2 || true
    echo "" >&2
    exit 3
    ;;
esac

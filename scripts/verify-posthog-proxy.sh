#!/usr/bin/env bash
# Verify that the PostHog reverse-proxy Cloudflare Worker is actually
# intercepting raizdirecta.es/ingest/* and forwarding to PostHog EU.
#
# Why this script exists:
#   The Worker code can be merged to main (the static contract test in
#   test/contracts/posthog-proxy-worker.test.ts pins the source) without
#   anyone having run `npx wrangler deploy`. When that happens, requests
#   to /ingest/* fall through to the Next.js app and 404 silently — and
#   if NEXT_PUBLIC_POSTHOG_HOST is set in production env, the SDK will
#   POST every analytics event into the void (and the SDK won't retry,
#   because a 404 isn't a 5xx).
#
#   We hit this exact gap on 2026-05-04: PR #1100 was in main since
#   2026-05-03 but no one had deployed the Worker. This script makes
#   the gap impossible to miss.
#
# Usage:
#   scripts/verify-posthog-proxy.sh                  # against raizdirecta.es
#   scripts/verify-posthog-proxy.sh <host>           # against any host
#
#   Exit 0 = Worker is deployed and forwarding correctly.
#   Exit 1 = Worker is missing or misconfigured. See stderr for details.
#
# What this script does NOT do:
#   - Authenticate with a real PostHog project key. We only need to
#     prove the Worker forwards bytes to PostHog — PostHog itself will
#     reject our smoke payload (401 / 200 with a benign decision).
#     Either response shape proves the proxy works.
#   - Send a test event into the prod project. We hit /decide (read-only
#     feature-flag eval), not /e/ (event capture), so prod analytics
#     stay clean.

set -Eeuo pipefail

HOST="${1:-raizdirecta.es}"
BASE="https://${HOST}/ingest"
UPSTREAM="https://eu.i.posthog.com"

failures=0

# A throwaway key. PostHog will respond with shape, not data. Real
# project keys live in Vercel/host secrets — we never need one here.
SMOKE_KEY="phc_smoke_verify_proxy_only"
SMOKE_BODY="{\"api_key\":\"${SMOKE_KEY}\",\"distinct_id\":\"smoke-verify\"}"

note() { printf '%s\n' "$*"; }
ok()   { printf 'OK   %s\n' "$*"; }
fail() { printf 'FAIL %s\n' "$*" >&2; failures=$((failures + 1)); }

curl_status_and_headers() {
  # POST to the given URL with a JSON body, return:
  #   <status>\t<x-powered-by>\t<content-type>\t<set-cookie present?>
  local url="$1"
  local body="$2"
  local headers_file
  headers_file="$(mktemp)"

  local status
  status="$(curl -sS -o /dev/null -D "$headers_file" -w '%{http_code}' \
    --max-time 10 \
    -H 'Content-Type: application/json' \
    -X POST \
    -d "$body" \
    "$url" || echo '000')"

  local powered
  powered="$(awk 'tolower($1) == "x-powered-by:" { sub(/\r$/,""); $1=""; print substr($0,2); exit }' "$headers_file")"
  local ctype
  ctype="$(awk 'tolower($1) == "content-type:" { sub(/\r$/,""); $1=""; print substr($0,2); exit }' "$headers_file")"
  local setcookie
  setcookie="$(awk 'tolower($1) == "set-cookie:" { print "yes"; exit }' "$headers_file")"

  rm -f "$headers_file"
  printf '%s\t%s\t%s\t%s\n' "$status" "${powered:-}" "${ctype:-}" "${setcookie:-no}"
}

curl_get_status() {
  local url="$1"
  local headers_file
  headers_file="$(mktemp)"
  local status
  status="$(curl -sS -o /dev/null -D "$headers_file" -w '%{http_code}' \
    --max-time 10 "$url" || echo '000')"
  local powered
  powered="$(awk 'tolower($1) == "x-powered-by:" { sub(/\r$/,""); $1=""; print substr($0,2); exit }' "$headers_file")"
  rm -f "$headers_file"
  printf '%s\t%s\n' "$status" "${powered:-}"
}

note "Verifying PostHog reverse-proxy Worker at ${BASE}"
note ""

# 1. Upstream sanity. If PostHog itself is down we want to know that
#    BEFORE we accuse the Worker of being broken.
note "1. PostHog upstream sanity"
upstream_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 \
  -H 'Content-Type: application/json' -X POST -d "$SMOKE_BODY" \
  "${UPSTREAM}/decide?v=3" || echo '000')"
case "$upstream_status" in
  200|401)
    ok "${UPSTREAM}/decide -> ${upstream_status} (PostHog reachable)"
    ;;
  *)
    fail "${UPSTREAM}/decide -> ${upstream_status} (PostHog upstream looks unhealthy; check status.posthog.com before blaming the Worker)"
    ;;
esac
note ""

# 2. Proxy /decide. The discriminator: x-powered-by: Next.js means the
#    request fell through to the app. Anything else (or empty) means
#    the Worker handled it.
note "2. Proxy /ingest/decide (the smoking gun)"
IFS=$'\t' read -r status powered ctype setcookie < <(curl_status_and_headers "${BASE}/decide?v=3" "$SMOKE_BODY")
note "   status=${status} x-powered-by='${powered}' content-type='${ctype}' set-cookie='${setcookie}'"

if [[ "$status" == "000" ]]; then
  fail "could not reach ${BASE}/decide at all (DNS / TLS / network)"
elif printf '%s' "$powered" | grep -qi 'next.js'; then
  fail "${BASE}/decide hit the Next.js app, not the Worker. The Cloudflare Worker route 'raizdirecta.es/ingest/*' is NOT registered. Run 'cd infra/cloudflare/posthog-proxy && npx wrangler deploy'."
elif printf '%s' "$ctype" | grep -qi 'text/html'; then
  fail "${BASE}/decide returned HTML (content-type='${ctype}'). The Worker is missing — request fell through to the app."
elif [[ "$status" == "200" || "$status" == "401" ]]; then
  ok "${BASE}/decide -> ${status} (Worker is forwarding to PostHog correctly)"
elif [[ "$status" == "502" ]]; then
  fail "${BASE}/decide -> 502 (Worker is up, but cannot reach PostHog upstream — check src/index.ts POSTHOG_API_HOST)"
else
  fail "${BASE}/decide -> ${status} (unexpected; expected 200 or 401 from PostHog)"
fi

if [[ "$setcookie" == "yes" ]]; then
  fail "${BASE}/decide returned a Set-Cookie header — the Worker MUST strip it (privacy invariant). See infra/cloudflare/posthog-proxy/src/index.ts STRIP_RESPONSE_HEADERS."
else
  ok "Set-Cookie correctly stripped from upstream response"
fi
note ""

# 3. Proxy /static/* (the recorder.js asset path). Different upstream
#    host (eu-assets.i.posthog.com), different content-type — confirms
#    the Worker's asset routing branch works, not just the API branch.
note "3. Proxy /ingest/static/array.js (asset upstream branch)"
IFS=$'\t' read -r status powered < <(curl_get_status "${BASE}/static/array.js")
note "   status=${status} x-powered-by='${powered}'"

if printf '%s' "$powered" | grep -qi 'next.js'; then
  fail "${BASE}/static/array.js hit Next.js — Worker missing or asset branch broken."
elif [[ "$status" == "200" ]]; then
  ok "${BASE}/static/array.js -> 200 (asset routing works)"
elif [[ "$status" == "404" ]]; then
  # PostHog has rotated asset paths before; a 404 from PostHog itself
  # (no Next.js x-powered-by) is a soft-fail — flag but don't break.
  note "WARN ${BASE}/static/array.js -> 404 from upstream. Asset path may have moved; check infra/cloudflare/posthog-proxy/README.md 'Rotate the upstream host'."
else
  fail "${BASE}/static/array.js -> ${status} (unexpected)"
fi
note ""

if (( failures > 0 )); then
  note ""
  note "${failures} check(s) failed. The proxy is NOT in a healthy state."
  note "See infra/cloudflare/posthog-proxy/README.md for deploy + rollback steps."
  exit 1
fi

note ""
note "All proxy checks passed. /ingest/* is being intercepted by the Worker and forwarded to PostHog EU."

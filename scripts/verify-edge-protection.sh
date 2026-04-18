#!/usr/bin/env bash
#
# Drop-in verification script for the edge-protection runbook
# (docs/runbooks/edge-protection.md). Runs the manual curl checks
# from that document and prints a pass/fail verdict per check so you
# can eyeball one report instead of scrolling through seven shells.
#
# Usage:
#   APP_HOST=marketplace.tld ORIGIN_IP=203.0.113.42 \
#     ./scripts/verify-edge-protection.sh
#
# Optional:
#   AUTH_PATH   (default /api/auth/signin) — path to burst for the
#               rate-limit check. Uses POST with a dummy body.
#   BURST       (default 30) — burst size for the rate-limit check.
#   CF_IP_RE    (default "^(104\.|172\.|2606:4700:")
#               DNS A-record prefixes Cloudflare uses. If your edge
#               is another provider, pass its prefix regex here.
#
# Exit codes:
#   0  — all checks passed
#   1  — one or more checks failed (details above)
#   2  — missing required env (APP_HOST / ORIGIN_IP)

set -uo pipefail

APP_HOST="${APP_HOST:-}"
ORIGIN_IP="${ORIGIN_IP:-}"
AUTH_PATH="${AUTH_PATH:-/api/auth/signin}"
BURST="${BURST:-30}"
CF_IP_RE="${CF_IP_RE:-^(104\.|172\.|2606:4700:)}"

if [[ -z "$APP_HOST" || -z "$ORIGIN_IP" ]]; then
  echo "error: APP_HOST and ORIGIN_IP are required" >&2
  echo "  example: APP_HOST=marketplace.tld ORIGIN_IP=203.0.113.42 $0" >&2
  exit 2
fi

pass=0
fail=0

ok()   { echo "  ✓ $*"; pass=$((pass+1)); }
err()  { echo "  ✗ $*"; fail=$((fail+1)); }
step() { echo; echo "── $* ──"; }

# ── 1. DNS points at edge, not origin ──────────────────────────────
#
# A record for the app host should be in Cloudflare (or whoever you
# put in CF_IP_RE), not the Proxmox public IP. If it points at the
# origin, the edge is not actually in the request path.
step "DNS: $APP_HOST resolves via edge, not origin"
resolved="$(dig +short "$APP_HOST" A | head -1)"
if [[ -z "$resolved" ]]; then
  err "no A record for $APP_HOST"
elif [[ "$resolved" == "$ORIGIN_IP" ]]; then
  err "A record points at the origin IP ($resolved) — edge is bypassed"
elif [[ "$resolved" =~ $CF_IP_RE ]]; then
  ok "A → $resolved (matches CF_IP_RE)"
else
  err "A → $resolved — not origin, but also not matching CF_IP_RE ($CF_IP_RE)"
fi

# ── 2. Origin IP refuses direct HTTPS ──────────────────────────────
#
# After Cloudflare Tunnel + origin firewall, a request that resolves
# APP_HOST directly at the Proxmox IP should fail (connection reset,
# timeout, or 444). If it succeeds the edge can be bypassed.
step "Origin: direct HTTPS to $ORIGIN_IP is refused for $APP_HOST"
if curl -sS --max-time 5 --resolve "$APP_HOST:443:$ORIGIN_IP" \
     "https://$APP_HOST" >/dev/null 2>&1; then
  err "direct-IP request succeeded — origin is still publicly reachable"
else
  ok "direct-IP request refused (timeout, reset, or 444)"
fi

# ── 3. Host header spoofing returns 404 ────────────────────────────
#
# Traefik should have a strict Host() matcher on every router plus a
# default 444/404 service so probes like `curl -H 'Host: evil.com'`
# against the origin IP go nowhere.
step "Traefik: unknown Host on origin IP returns 404/444"
code="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' \
         --resolve "evil.example.invalid:443:$ORIGIN_IP" \
         -H "Host: evil.example.invalid" \
         "https://evil.example.invalid" 2>/dev/null || echo "000")"
case "$code" in
  404|421|444|000) ok "got HTTP $code (no routing for unknown Host)" ;;
  200)             err "got HTTP 200 — Traefik has a permissive default router" ;;
  *)               err "got HTTP $code — expected 404/421/444 or a connection failure" ;;
esac

# ── 4. Edge rate limit bites before origin ─────────────────────────
#
# Burst $BURST POSTs in under a minute and count how many come back
# non-429. Cloudflare's default auth-surface rule blocks at 20/min
# per IP. If no 429 appears the edge rule isn't active.
step "Edge rate limit: $BURST POSTs to $APP_HOST$AUTH_PATH"
codes=()
for _ in $(seq 1 "$BURST"); do
  c="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' \
         -X POST -H 'content-type: application/json' \
         --data '{}' "https://$APP_HOST$AUTH_PATH" 2>/dev/null || echo '000')"
  codes+=("$c")
done
got_429=0
for c in "${codes[@]}"; do [[ "$c" == "429" ]] && got_429=$((got_429+1)); done
if [[ "$got_429" -ge 1 ]]; then
  ok "$got_429/${#codes[@]} responses were 429 (edge rate limit firing)"
else
  err "no 429s in $BURST requests — edge rate limit rule likely missing"
fi

# ── 5. CF-Ray header present ───────────────────────────────────────
#
# If Cloudflare proxies the request, its response carries a cf-ray
# identifier. Its absence means the request bypassed Cloudflare.
step "Edge: response carries cf-ray (or equivalent) header"
headers="$(curl -sS --max-time 5 -I "https://$APP_HOST" 2>/dev/null)"
if echo "$headers" | grep -qi '^cf-ray:'; then
  ok "cf-ray header present"
elif echo "$headers" | grep -qiE '^(x-akamai-|x-amz-cf-id|server: cloudfront|x-vercel-)'; then
  ok "non-Cloudflare edge header present — update expected provider regex if needed"
else
  err "no edge-provider header — request did not pass through a proxy"
fi

# ── Summary ────────────────────────────────────────────────────────
echo
echo "──────────────────────────────────"
echo "Passed: $pass   Failed: $fail"
echo "──────────────────────────────────"
[[ "$fail" -eq 0 ]] && exit 0 || exit 1

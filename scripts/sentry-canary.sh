#!/usr/bin/env bash
# Sentry alert canary (#1212).
#
# Fires synthetic events for every P0 alert listed in
# `infra/sentry-alerts.yaml` so an operator can confirm — by watching
# the configured Telegram channels — that the rules in the Sentry UI
# actually wire through to an alert.
#
# Usage:
#   bash scripts/sentry-canary.sh [staging|production]
#
# Defaults to `staging` because production canaries are routed to
# real on-call channels and you don't want to wake people up by
# accident. Production runs MUST be coordinated in the ops channel
# first, with a "canary in 5" message; the runbook
# `docs/runbooks/sentry.md` § "Canary procedure" has the full sequence.
#
# Each section emits a single event and pauses for ~3 s so the rules
# evaluate independently. The script does NOT sleep through the alert
# window itself — confirmation in Telegram is on the operator.
#
# Requires:
#   - `sentry-cli` on PATH (https://docs.sentry.io/cli/)
#   - SENTRY_AUTH_TOKEN env var (org-scoped, with project:write)
#   - SENTRY_ORG and SENTRY_PROJECT env vars matching the dashboard
#
# What this script CANNOT verify:
#   - Whether Telegram actually relayed the alert (network on the
#     Sentry side). The operator confirms by eyeballing the channel.
#   - Whether the alert RULE in the UI actually exists. A missing
#     rule means no alert fires; the canary event still posts to
#     Sentry. Cross-check with `infra/sentry-alerts.yaml`.

set -euo pipefail

ENV="${1:-staging}"
case "$ENV" in
  staging|production) ;;
  *)
    echo "Usage: $0 [staging|production]" >&2
    exit 2
    ;;
esac

if [ "$ENV" = "production" ] && [ "${I_KNOW_THIS_PAGES_ONCALL:-}" != "yes" ]; then
  cat >&2 <<EOF
Refusing to canary against production without explicit consent.
Set I_KNOW_THIS_PAGES_ONCALL=yes and re-run.

Coordinate first: post "running Sentry canary in 5 min" to the
on-call channel so the alerts that fire don't get treated as a
real incident.
EOF
  exit 3
fi

require_env() {
  local var="$1"
  if [ -z "${!var:-}" ]; then
    echo "Missing required env var: $var" >&2
    exit 4
  fi
}
require_env SENTRY_AUTH_TOKEN
require_env SENTRY_ORG
require_env SENTRY_PROJECT

if ! command -v sentry-cli >/dev/null 2>&1; then
  echo "sentry-cli not found on PATH. Install: https://docs.sentry.io/cli/" >&2
  exit 5
fi

DSN="${SENTRY_DSN:-}"
if [ -z "$DSN" ]; then
  echo "SENTRY_DSN must be set to the project DSN (server-side)." >&2
  exit 6
fi

emit() {
  local rule="$1"
  local message="$2"
  local scope="${3:-}"
  local extra_tag="${4:-}"

  local args=(
    send-event
    --message "$message"
    --tag "canary:1"
    --tag "canary.rule:$rule"
    --tag "environment:$ENV"
  )
  if [ -n "$scope" ]; then
    args+=(--tag "domain.scope:$scope")
  fi
  if [ -n "$extra_tag" ]; then
    args+=(--tag "$extra_tag")
  fi

  echo "→ canary($rule): $message"
  SENTRY_DSN="$DSN" sentry-cli "${args[@]}" >/dev/null
  sleep 3
}

# --- 1. 5xx-rate-global ----------------------------------------------------
# A flat 1% of 100 requests is a single error, but the alert evaluates
# over actual transactions. We can't reliably synthesize the
# denominator — the operator confirms by observing in Sentry that the
# event lands and the alert rule conditions match.
emit "5xx-rate-global" \
  "[CANARY] synthetic 5xx for global error-rate rule" \
  "checkout.canary"

# --- 2. 5xx-stripe-webhook -------------------------------------------------
emit "5xx-stripe-webhook" \
  "[CANARY] synthetic 5xx in /api/webhooks/stripe" \
  "stripe.webhook.canary" \
  "transaction:POST /api/webhooks/stripe"

# --- 3. payment-mismatch-any ----------------------------------------------
# This is the alert most likely to be misconfigured because it routes
# to security AND on-call. Event must be a single explicit one.
emit "payment-mismatch-any" \
  "[CANARY] synthetic stripe.webhook.payment_mismatch event" \
  "stripe.webhook.payment_mismatch"

# --- 4. ready-probe-failed (external — Healthchecks.io) -------------------
echo "→ skip(ready-probe-failed): external Healthchecks.io alert; trigger by"
echo "  pausing the production /api/ready route or by stopping the cron ping"
echo "  for ≥ 4 min. NOT a Sentry rule — see infra/sentry-alerts.yaml."

# --- 5. auth-signin-failed-burst ------------------------------------------
# 30/min trigger; emit 35 in quick succession.
echo "→ canary(auth-signin-failed-burst): firing 35 events…"
for i in $(seq 1 35); do
  SENTRY_DSN="$DSN" sentry-cli send-event \
    --message "[CANARY] auth.signin.failed burst $i/35" \
    --tag "canary:1" \
    --tag "canary.rule:auth-signin-failed-burst" \
    --tag "domain.scope:auth.signin.failed" \
    --tag "environment:$ENV" >/dev/null
done
echo "  (sleeping 65 s so the rate-limit window evaluates)"
sleep 65

# --- 6. oauth-callback-error-rate -----------------------------------------
emit "oauth-callback-error-rate" \
  "[CANARY] synthetic oauth callback error" \
  "auth.oauth.callback_error"

# --- 7. checkout-funnel-collapse (external — PostHog) ---------------------
echo "→ skip(checkout-funnel-collapse): external PostHog funnel alert; trigger"
echo "  by reading PostHog dashboard with a constructed time range, or wait"
echo "  for an organic dip. NOT a Sentry rule — see infra/sentry-alerts.yaml."

# --- 8. dlq-pending-or-spike ----------------------------------------------
# 3 events over 24h trigger; emit 3.
for i in 1 2 3; do
  emit "dlq-pending-or-spike" \
    "[CANARY] queue.dlq.entry $i/3" \
    "queue.dlq.entry"
done

# --- 9. db-connection-error-burst -----------------------------------------
# 5/min trigger; emit 6 in quick succession with the right fingerprint.
echo "→ canary(db-connection-error-burst): firing 6 events…"
for i in $(seq 1 6); do
  SENTRY_DSN="$DSN" sentry-cli send-event \
    --message "[CANARY] connect ECONNREFUSED 127.0.0.1:5432 (synthetic $i/6)" \
    --tag "canary:1" \
    --tag "canary.rule:db-connection-error-burst" \
    --tag "exception.type:PrismaClientInitializationError" \
    --tag "environment:$ENV" >/dev/null
done

# --- 10. ratelimit-degraded-fail-closed -----------------------------------
emit "ratelimit-degraded-fail-closed" \
  "[CANARY] ratelimit.degraded fail-closed" \
  "ratelimit.degraded" \
  "fail_mode:closed"

cat <<EOF

================================================================
Canary complete. Operator checklist:
  1. Open the Telegram channels listed in infra/sentry-alerts.yaml
     (oncall, security) and confirm each rule fired exactly once.
     Rules 4 + 7 are external (Healthchecks.io / PostHog) and were
     skipped — verify those separately per the runbook.
  2. Any rule that did NOT fire: open Sentry → Alerts → that rule
     and check the conditions match the canary event's tags.
     Update infra/sentry-alerts.yaml AND the UI in the same change.
  3. Update docs/runbooks/sentry.md § "Alerts armed" with the
     date this canary ran + the operator who ran it.

Quarterly cadence: re-run this canary on the first Monday of the
quarter against staging. Production canaries are coordinated
incident-style (post in on-call channel first).
================================================================
EOF

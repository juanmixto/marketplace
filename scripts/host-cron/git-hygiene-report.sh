#!/usr/bin/env bash
# scripts/host-cron/git-hygiene-report.sh
#
# Monthly cron entrypoint. Runs the read-only git-hygiene report plus the
# rescue-sweep report, both targeted at the shared marketplace repo, and
# emits a structured summary that the operator can read in the journal.
#
# Never destructive — this exists to surface accumulation, not to act on
# it. The fix is `bash scripts/git-hygiene.sh --clean` run by hand.
#
# systemd: raizdirecta-git-hygiene.service / .timer

set -Eeuo pipefail

REPO="${MARKETPLACE_REPO:-/home/whisper/marketplace}"
HC_PING="${HC_PING_GIT_HYGIENE:-}"

cd "$REPO"

# Refresh remote-tracking refs so the report reflects current state.
# `fetch --prune` removes refs for branches deleted upstream — required
# for the [gone] detection in git-hygiene.sh §2 to be accurate.
git fetch --prune --quiet

echo "=== git-hygiene report (read-only) ==="
bash scripts/git-hygiene.sh

echo
echo "=== rescue/* sweep report (read-only) ==="
RESCUE_OUT=$(bash scripts/rescue-sweep.sh 2>&1 || true)
echo "$RESCUE_OUT"

echo
WT_COUNT=$(git worktree list | wc -l | tr -d ' ')
RESCUE_TOTAL=$(git for-each-ref --format='%(refname:short)' 'refs/heads/rescue/**' | wc -l | tr -d ' ')
RESCUE_OLD=$(echo "$RESCUE_OUT" | sed -n 's/.*Older than [0-9]*d:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
RESCUE_OLD="${RESCUE_OLD:-0}"
echo "=== summary ==="
echo "  worktrees:                 $WT_COUNT"
echo "  rescue/* branches:         $RESCUE_TOTAL"
echo "  rescue/* older than 30d:   ${RESCUE_OLD}"
echo
echo "  To act: bash scripts/git-hygiene.sh --clean   (interactive)"
echo "          bash scripts/rescue-sweep.sh --delete (interactive)"

# Healthchecks success ping (optional). Failure pings are routed by the
# OnFailure= handler in the .service unit, not here.
if [ -n "$HC_PING" ]; then
  curl --silent --max-time 10 "$HC_PING" >/dev/null 2>&1 || true
fi

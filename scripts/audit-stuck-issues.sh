#!/usr/bin/env bash
# scripts/audit-stuck-issues.sh
#
# Read-only sweep of issue hygiene state. Intended to be run by a human
# operator periodically (or after a long batch of merges) to catch
# accumulated drift the end-of-turn stop hook missed.
#
# Reports two classes of finding:
#
#   A. Issues still OPEN despite a recent PR claiming to close them.
#      Scans the last N merged PRs (default 100) for closing keywords
#      (Closes/Fixes/Resolves #N), checks each referenced issue's
#      state, and flags the ones that didn't actually close.
#
#   B. Issues with the `in-progress` label and no activity in >48h.
#      Likely abandoned WIP that should either be unlabelled, closed,
#      or commented on.
#
# Does NOT modify anything. The output is a checklist for the operator.
# Pairs with the end-of-turn checks in scripts/agent-stop-checks.sh § 4
# (which catch the SAME failure modes within a 24h window) — this
# script handles older drift.
#
# Companion to memory/feedback_issue_workflow.md.

set -euo pipefail

LIMIT="${LIMIT:-100}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not installed — install from https://cli.github.com/" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh CLI not authenticated — run 'gh auth login' first." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq not installed — required for JSON parsing." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# A. Recently merged PRs whose referenced issues are still OPEN
# ---------------------------------------------------------------------------
echo "==> A. Scanning last ${LIMIT} merged PRs for unclosed referenced issues..."
echo

merged_json="$(gh pr list \
  --state merged --limit "$LIMIT" \
  --json number,title,body,mergedAt,author 2>/dev/null || echo '[]')"

# Extract (pr_num, pr_title, pr_author, issue_num) tuples.
pairs="$(echo "$merged_json" | jq -r '
  .[] | . as $pr |
  ($pr.body // "") |
  [ scan("(?i)\\b(?:closes|fixes|resolves)\\s+#([0-9]+)") ] |
  .[] |
  "\($pr.number)\t\($pr.author.login)\t\(.[0])\t\($pr.title)"
' 2>/dev/null)"

stuck_count=0
seen_issues=""
while IFS=$'\t' read -r pr_num pr_author issue_num pr_title; do
  [[ -z "$issue_num" ]] && continue
  # Skip duplicates (one issue closed by multiple PRs)
  case " $seen_issues " in
    *" $issue_num "*) continue ;;
  esac
  seen_issues="$seen_issues $issue_num"

  state="$(gh issue view "$issue_num" --json state --jq .state 2>/dev/null || echo '')"
  if [[ "$state" == "OPEN" ]]; then
    issue_title="$(gh issue view "$issue_num" --json title --jq .title 2>/dev/null || echo '')"
    echo "  ⚠ #${issue_num} OPEN — claimed closed by PR #${pr_num} (@${pr_author})"
    echo "      issue: ${issue_title}"
    echo "      pr:    ${pr_title}"
    echo "      fix:   gh issue close ${issue_num} --comment \"Resuelto en #${pr_num}\""
    echo
    stuck_count=$((stuck_count + 1))
  fi
done <<< "$pairs"

if [[ "$stuck_count" -eq 0 ]]; then
  echo "  ✓ No stuck issues — every recently-claimed issue is CLOSED."
  echo
fi

# ---------------------------------------------------------------------------
# B. Issues labelled `in-progress` with stale activity
# ---------------------------------------------------------------------------
echo "==> B. Scanning OPEN issues with label 'in-progress' for >48h inactivity..."
echo

stale_wip="$(gh issue list \
  --label "in-progress" --state open --limit 50 \
  --json number,title,updatedAt,assignees \
  --jq "[.[] | select((.updatedAt | fromdateiso8601) < (now - 48*3600))]" \
  2>/dev/null || echo '[]')"

stale_count="$(echo "$stale_wip" | jq 'length' 2>/dev/null || echo 0)"
if [[ "${stale_count:-0}" -eq 0 ]]; then
  echo "  ✓ No stale in-progress issues."
else
  echo "$stale_wip" | jq -r '.[] | "  ⚠ #\(.number) \(.title)\n      last update: \(.updatedAt)\n      fix: gh issue edit \(.number) --remove-label \"in-progress\"\n"' 2>/dev/null
fi

echo
echo "==> Done. ${stuck_count} stuck issue(s), ${stale_count} stale in-progress."

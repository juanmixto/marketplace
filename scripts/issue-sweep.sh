#!/usr/bin/env bash
# scripts/issue-sweep.sh
#
# Cross-references open GitHub issues against local git history. Reports:
#   - Ghost-open: issues with commits referencing them but still open.
#     Likely already implemented — verify acceptance criteria + close
#     with comment.
#   - PR-in-flight: an OPEN PR references the issue (will auto-close on
#     merge if `Closes #N` is in the PR body).
#   - Real backlog: no commits, no PR, no progress.
#
# Read-only. Designed for the periodic backlog hygiene loop documented
# in memory/feedback_issue_sweep_pattern.md. The auto-close on PR merge
# requires `Closes #N` exactly in the PR body, and user repos lack the
# issue-types features that would make the rot visible. We had ~10
# issues in the ghost-open state on 2026-05-05.
#
# Usage:
#   bash scripts/issue-sweep.sh [--label LABEL] [--limit N] [--all]
#
# Defaults: --label critical, limit 50.
# --all: skip label filter (all open issues).
#
# Companion to scripts/agents-status.sh (session start) and
# scripts/agent-stop-checks.sh (session end). Run between sessions when
# the backlog feels stale.

set -Eeuo pipefail

# Cross-reference against the SHARED main repo, not whichever worktree
# the script lives in. Any agent's worktree branches off origin/main, so
# the canonical history lives in MARKETPLACE_REPO (default
# /home/whisper/marketplace). Override for a different layout.
REPO_ROOT="${MARKETPLACE_REPO:-/home/whisper/marketplace}"
if [[ ! -d "$REPO_ROOT/.git" ]]; then
  REPO_ROOT="$(git -C "$(dirname "$0")/.." rev-parse --show-toplevel 2>/dev/null || pwd)"
fi

# ---- args ----
label="critical"
limit=50
all_open=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --label) label="$2"; shift 2 ;;
    --limit) limit="$2"; shift 2 ;;
    --all) all_open=1; shift ;;
    -h|--help)
      sed -n '2,30p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---- color helpers ----
if [[ -t 1 ]]; then
  bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
  warn()   { printf '\033[33m%s\033[0m\n' "$*"; }
  ok()     { printf '\033[32m%s\033[0m\n' "$*"; }
  dim()    { printf '\033[2m%s\033[0m\n' "$*"; }
else
  bold() { echo "$@"; }; warn() { echo "$@"; }; ok() { echo "$@"; }; dim() { echo "$@"; }
fi

# ---- preflight ----
if ! command -v gh >/dev/null 2>&1; then
  echo "Refusing to sweep: gh CLI not installed." >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Refusing to sweep: gh CLI not authenticated. Run 'gh auth login'." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "Refusing to sweep: jq not installed (apt install jq)." >&2
  exit 1
fi

# ---- fetch issues ----
filter_args=()
if [[ "$all_open" -eq 0 ]]; then
  filter_args+=(--label "$label")
fi
filter_args+=(--state open --limit "$limit" --json number,title)

filter_desc="label=$label"
if [[ "$all_open" -eq 1 ]]; then
  filter_desc="all open"
fi
bold "Issue sweep — repo: $(basename "$REPO_ROOT"), filter: $filter_desc, limit: $limit"
echo

issues_json="$(gh issue list "${filter_args[@]}")"
total=$(echo "$issues_json" | jq 'length')
echo "Fetched $total open issues."
echo

# Fetch ALL my open PRs ONCE. Then for each issue, look up locally
# instead of one `gh pr list` per issue (slow + GitHub rate-limit risk
# on 100-issue sweeps).
all_open_prs="$(gh pr list --state open --limit 200 --json number,title,body 2>/dev/null || echo '[]')"

# ---- categorize ----
ghost_open=()
real_backlog=()
prs_in_flight=()

while IFS=$'\t' read -r num title; do
  [[ -z "$num" ]] && continue

  # Count commits on any branch referencing #num. \b avoids matching
  # #1234 when looking for #123.
  commit_count=$(git -C "$REPO_ROOT" log --all --oneline --grep="#${num}\b" 2>/dev/null | wc -l | tr -d ' ')

  # Look for an open PR that mentions this issue in body or title.
  matching_pr=$(echo "$all_open_prs" | jq -r --arg n "$num" '
    [.[] | select((.body // "" | test("#" + $n + "\\b")) or (.title // "" | test("#" + $n + "\\b")))]
    | .[0].number // empty
  ' 2>/dev/null)

  if [[ -n "$matching_pr" ]]; then
    prs_in_flight+=("#${num}|${title}|${commit_count}|#${matching_pr}")
  elif [[ "$commit_count" -gt 0 ]]; then
    last_commit=$(git -C "$REPO_ROOT" log --all --oneline --grep="#${num}\b" 2>/dev/null | head -1 | cut -c1-80)
    ghost_open+=("#${num}|${title}|${commit_count}|${last_commit}")
  else
    real_backlog+=("#${num}|${title}")
  fi
done < <(echo "$issues_json" | jq -r '.[] | [.number, (.title | .[0:80])] | @tsv')

# ---- report ----
echo
bold "1. Ghost-open: issues with commits referencing them"
dim "   Likely already implemented; verify acceptance criteria + close with comment."
if [[ ${#ghost_open[@]} -eq 0 ]]; then
  ok "   none"
else
  for line in "${ghost_open[@]}"; do
    IFS='|' read -r num title count last <<< "$line"
    warn "   $num  [$count commits]  $title"
    dim  "      last: $last"
  done
  echo
  dim "   Verify each in code, then close with evidence:"
  dim '     gh issue close <N> --comment "..."'
fi
echo

bold "2. PRs-in-flight: open PRs reference the issue"
dim "   These will close automatically when the PR merges (if 'Closes #N' is in body)."
if [[ ${#prs_in_flight[@]} -eq 0 ]]; then
  ok "   none"
else
  for line in "${prs_in_flight[@]}"; do
    IFS='|' read -r num title count pr <<< "$line"
    echo "   $num  $title"
    dim  "      → $pr (verify body has 'Closes $num' or close manually after merge)"
  done
fi
echo

bold "3. Real backlog: no commits, no PR, no progress yet"
if [[ ${#real_backlog[@]} -eq 0 ]]; then
  ok "   none"
else
  for line in "${real_backlog[@]}"; do
    IFS='|' read -r num title <<< "$line"
    echo "   $num  $title"
  done
fi
echo

bold "Summary"
echo "  ghost-open:       ${#ghost_open[@]} (verify + close)"
echo "  PR in flight:     ${#prs_in_flight[@]} (will auto-close on merge if linked)"
echo "  real backlog:     ${#real_backlog[@]} (actual work)"
echo
dim "Memory: feedback_issue_sweep_pattern.md"

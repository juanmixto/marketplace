#!/usr/bin/env bash
# scripts/audit-prs-behind.sh
#
# Lists your open PRs whose mergeStateStatus is BEHIND, with the path to
# the worktree where the branch is checked out (if any). Optional
# --rebase flag rebases each in turn and force-pushes.
#
# Read-only by default — designed to be safe to run on every session
# start. With --rebase it will rebase + force-push each branch in
# series; failures abort the loop and leave a partial state.
#
# Why this script exists:
# Without GitHub merge queue (PR #1305 documents the manual toggle),
# every time one of your --auto PRs lands, the rest fall back to BEHIND
# and need a manual rebase. Memory feedback_track_all_open_prs +
# feedback_bundle_related_prs both reference this loop. This script
# replaces the ~6 manual `git rebase + push --force-with-lease` cycles
# that this loop costs per session.
#
# Usage:
#   bash scripts/audit-prs-behind.sh             # report only
#   bash scripts/audit-prs-behind.sh --rebase    # rebase + push each
#
# Safe to run anywhere — ignores PRs without an on-disk worktree.

set -Eeuo pipefail

if [[ -t 1 ]]; then
  bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
  warn()   { printf '\033[33m%s\033[0m\n' "$*"; }
  ok()     { printf '\033[32m%s\033[0m\n' "$*"; }
  dim()    { printf '\033[2m%s\033[0m\n' "$*"; }
else
  bold() { echo "$@"; }; warn() { echo "$@"; }; ok() { echo "$@"; }; dim() { echo "$@"; }
fi

REPO_ROOT="${MARKETPLACE_REPO:-/home/whisper/marketplace}"
do_rebase=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rebase) do_rebase=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

if ! command -v gh >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
  echo "Refusing to run: gh CLI and jq are required." >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Refusing to run: gh CLI not authenticated." >&2
  exit 1
fi

bold "Open PRs by you, BEHIND status"
prs_json="$(gh pr list --author '@me' --state open --json number,title,mergeStateStatus,headRefName 2>/dev/null || echo '[]')"
total=$(echo "$prs_json" | jq 'length')
behind=$(echo "$prs_json" | jq -r '[.[] | select(.mergeStateStatus == "BEHIND")] | length')
echo "  $behind BEHIND of $total open"
echo

if [[ "$behind" -eq 0 ]]; then
  ok "  Nothing to rebase."
  exit 0
fi

# Map branch -> worktree path.
declare -A wt_for
while IFS=$'\t' read -r path branch; do
  [[ -z "$branch" ]] && continue
  wt_for["$branch"]="$path"
done < <(git -C "$REPO_ROOT" worktree list --porcelain 2>/dev/null \
  | awk '/^worktree /{p=$2} /^branch /{sub(/^refs\/heads\//,"",$2); print p"\t"$2}')

# Walk BEHIND PRs.
while IFS=$'\t' read -r pr branch title; do
  [[ -z "$pr" ]] && continue
  wt="${wt_for[$branch]:-}"
  if [[ -z "$wt" ]]; then
    warn "  #$pr  no worktree on disk for branch '$branch'  ($title)"
    continue
  fi

  if [[ "$do_rebase" -eq 0 ]]; then
    echo "  #$pr  $branch -> $wt  ($title)"
    continue
  fi

  bold "  #$pr  rebasing $branch at $wt"
  if ! git -C "$wt" fetch origin main 2>&1 | tail -1 | sed 's/^/    /'; then
    warn "    fetch failed; skipping"
    continue
  fi
  rebase_out=$(git -C "$wt" rebase origin/main 2>&1) || true
  echo "$rebase_out" | tail -3 | sed 's/^/    /'
  if echo "$rebase_out" | grep -q 'Successfully rebased'; then
    git -C "$wt" push --force-with-lease 2>&1 | tail -1 | sed 's/^/    /'
  elif echo "$rebase_out" | grep -q 'is up to date'; then
    dim "    already up to date"
  else
    warn "    rebase did not succeed cleanly; aborting"
    git -C "$wt" rebase --abort 2>/dev/null || true
  fi
  echo
done < <(echo "$prs_json" | jq -r '.[] | select(.mergeStateStatus == "BEHIND") | [.number, .headRefName, (.title | .[0:60])] | @tsv')

if [[ "$do_rebase" -eq 1 ]]; then
  bold "Done. Re-run without --rebase to confirm BEHIND count went down."
else
  dim "Re-run with --rebase to attempt automatic rebase + push for each."
fi

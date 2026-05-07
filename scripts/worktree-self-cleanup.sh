#!/usr/bin/env bash
# scripts/worktree-self-cleanup.sh
#
# Run from inside a worktree after `gh pr merge` succeeds. If the current
# worktree's branch was merged, switch to the shared repo and remove the
# worktree + local branch. Idempotent and safe — exits 0 with no action
# if conditions aren't met.
#
# Usage:
#   bash scripts/worktree-self-cleanup.sh           # only if PR is MERGED
#   bash scripts/worktree-self-cleanup.sh --force   # also if branch is in main but no PR
#
# Designed to chain after `gh pr merge --auto --squash --delete-branch`,
# e.g. via:
#   gh pr merge --auto --squash --delete-branch && \
#     bash scripts/worktree-self-cleanup.sh
#
# Won't fire from the shared repo or load-bearing detached HEADs.

set -euo pipefail

SHARED_REPO="/home/whisper/marketplace"
PROTECTED_WTS=(
  "/home/whisper/worktrees/main-preview"
  "/home/whisper/worktrees/release-current"
)

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
ok()    { printf '\033[32m%s\033[0m\n' "$*"; }
err()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
  esac
done

CWD_TOP="$(git rev-parse --show-toplevel 2>/dev/null || echo '')"
if [ -z "$CWD_TOP" ]; then
  err "Not in a git repo."; exit 1
fi

if [ "$CWD_TOP" = "$SHARED_REPO" ]; then
  warn "You are in the shared main repo, not a worktree. Nothing to clean up."
  exit 0
fi

for p in "${PROTECTED_WTS[@]}"; do
  if [ "$CWD_TOP" = "$p" ]; then
    warn "Refusing to remove protected worktree: $CWD_TOP"
    exit 0
  fi
done

CWD_BRANCH="$(git branch --show-current 2>/dev/null || echo '')"
if [ -z "$CWD_BRANCH" ]; then
  warn "Detached HEAD — nothing to cleanup automatically."
  exit 0
fi

# Check dirty tree — never remove uncommitted work.
DIRTY=$(git status --short | wc -l | tr -d ' ')
if [ "$DIRTY" -gt 0 ]; then
  err "Worktree has $DIRTY uncommitted change(s). Commit, push or stash before cleanup."
  exit 1
fi

# Decide if this branch is "done": MERGED PR (default) or in main (--force).
DONE=0
REASON=""
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  pr_state="$(gh pr list --state merged --limit 5 \
                --search "head:${CWD_BRANCH}" \
                --json number,state \
                --jq '.[0].state // empty' 2>/dev/null || echo '')"
  if [ "$pr_state" = "MERGED" ]; then
    DONE=1
    REASON="PR merged"
  fi
fi

if [ "$DONE" -eq 0 ] && [ "$FORCE" -eq 1 ]; then
  if git -C "$SHARED_REPO" merge-base --is-ancestor "$CWD_BRANCH" origin/main 2>/dev/null; then
    DONE=1
    REASON="branch is ancestor of origin/main (--force)"
  fi
fi

if [ "$DONE" -eq 0 ]; then
  warn "Branch '$CWD_BRANCH' is not merged (no MERGED PR found). Leaving worktree alone."
  warn "Use --force to remove anyway when branch is an ancestor of origin/main."
  exit 0
fi

bold "Removing worktree: $CWD_TOP  ($REASON)"

# git worktree remove must be invoked from the controlling repo, not from
# inside the worktree being removed.
cd "$SHARED_REPO"
if git worktree remove --force "$CWD_TOP"; then
  ok "  worktree removed."
else
  err "  worktree remove failed."
  exit 1
fi

# Drop the local branch ref. Safe because the PR landed (squash merge
# means the branch tip is NOT an ancestor of main, so use -D, not -d).
if git rev-parse --verify "$CWD_BRANCH" >/dev/null 2>&1; then
  if git branch -D "$CWD_BRANCH" >/dev/null 2>&1; then
    ok "  local branch '$CWD_BRANCH' deleted."
  else
    warn "  could not delete local branch '$CWD_BRANCH' (still in use elsewhere?)"
  fi
fi

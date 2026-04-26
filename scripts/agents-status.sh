#!/usr/bin/env bash
# scripts/agents-status.sh
#
# Snapshot of "what other agents (or sessions) currently have open" in
# this multi-agent repo. Read-only. Designed to be invoked at the start
# of a Claude Code session so the agent knows what NOT to touch.
#
# Companion to AGENTS.md § "Before your first tool call" and
# docs/git-workflow.md § "Concurrent-agent safety".

set -euo pipefail

bold()   { printf '\033[1m%s\033[0m\n' "$*"; }
warn()   { printf '\033[33m%s\033[0m\n' "$*"; }
err()    { printf '\033[31m%s\033[0m\n' "$*"; }
ok()     { printf '\033[32m%s\033[0m\n' "$*"; }
dim()    { printf '\033[2m%s\033[0m\n' "$*"; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo '')"
if [ -z "$REPO_ROOT" ]; then
  err "Not in a git repo."
  exit 1
fi

echo
bold "agents-status — snapshot of concurrent work"
dim  "Read-only. Run before starting a task; rerun if a session feels stale."
echo

# ---------------------------------------------------------------------------
# 1. Where am I right now?
# ---------------------------------------------------------------------------
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo 'detached')"
CURRENT_WT="$(git rev-parse --show-toplevel)"

bold "1. Current location"
echo "   cwd:    $CURRENT_WT"
echo "   branch: $CURRENT_BRANCH"

if [ "$CURRENT_WT" = "/home/whisper/marketplace" ]; then
  warn "   ⚠  You are in the SHARED main repo, not a worktree."
  warn "      Per AGENTS.md, agents should work in /home/whisper/worktrees/<task>/"
  warn "      Create one with:"
  warn "        git fetch origin main"
  warn "        git worktree add /home/whisper/worktrees/<slug> -b <prefix>/<slug> origin/main"
fi
echo

# ---------------------------------------------------------------------------
# 2. Worktrees with uncommitted changes (potential WIP from other agents)
# ---------------------------------------------------------------------------
bold "2. Worktrees with uncommitted changes"
HAS_WIP=0
while IFS= read -r line; do
  # `git worktree list --porcelain` blocks: `worktree <path>` then refs.
  case "$line" in
    worktree*)
      WT_PATH="${line#worktree }"
      ;;
    branch*)
      BR="${line#branch refs/heads/}"
      DIRTY=$(git -C "$WT_PATH" status --short 2>/dev/null | wc -l | tr -d ' ')
      if [ "$DIRTY" -gt 0 ]; then
        HAS_WIP=1
        if [ "$WT_PATH" = "$CURRENT_WT" ]; then
          ok   "   $DIRTY file(s) in $BR  ←  yours (current worktree)"
        else
          warn "   $DIRTY file(s) in $BR"
          warn "      → $WT_PATH"
        fi
      fi
      ;;
    detached)
      DIRTY=$(git -C "$WT_PATH" status --short 2>/dev/null | wc -l | tr -d ' ')
      if [ "$DIRTY" -gt 0 ]; then
        HAS_WIP=1
        warn "   $DIRTY file(s) in (detached HEAD)"
        warn "      → $WT_PATH"
      fi
      ;;
  esac
done < <(git worktree list --porcelain)

if [ "$HAS_WIP" -eq 0 ]; then
  ok "   none — all worktrees clean."
fi
echo

# ---------------------------------------------------------------------------
# 3. Long-lived stashes (>24h is a workflow violation per docs/git-workflow.md)
# ---------------------------------------------------------------------------
bold "3. Stashes (per docs/git-workflow.md, none should be >24h)"
STASH_LINES="$(git stash list 2>/dev/null || true)"
if [ -z "$STASH_LINES" ]; then
  ok "   none."
else
  echo "$STASH_LINES" | while IFS= read -r stash; do
    # Extract stash ref like stash@{0}
    REF="${stash%%:*}"
    AGE_SEC=$(git log -1 --format=%ct "$REF" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE_HOURS=$(( (NOW - AGE_SEC) / 3600 ))
    if [ "$AGE_HOURS" -gt 24 ]; then
      err  "   ⚠ ${AGE_HOURS}h: $stash"
    else
      ok   "   ${AGE_HOURS}h: $stash"
    fi
  done
fi
echo

# ---------------------------------------------------------------------------
# 4. Active dev servers (fast `ss` check on common ports)
# ---------------------------------------------------------------------------
bold "4. Listening dev servers (Next.js typical ports)"
ANY_PORT=0
for port in 3000 3001 3010 3020 3030; do
  PID_LINE=$(ss -tlnp 2>/dev/null | grep ":$port " | head -1 || true)
  if [ -n "$PID_LINE" ]; then
    ANY_PORT=1
    PID=$(echo "$PID_LINE" | grep -oP 'pid=\K[0-9]+' | head -1 || echo '?')
    echo "   :$port  pid=$PID"
  fi
done
if [ "$ANY_PORT" -eq 0 ]; then
  dim "   none on 3000-3030."
fi
echo

# ---------------------------------------------------------------------------
# 5. Hint
# ---------------------------------------------------------------------------
dim "For deep cleanup signals (gone branches, merged worktrees, etc.) run:"
dim "  scripts/git-hygiene.sh"
echo

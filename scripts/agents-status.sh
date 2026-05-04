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
# 5. Unpushed commits in the SHARED main repo (the dangerous case)
#
# The git wrapper blocks checkout/reset/stash/etc. inside the shared repo,
# but it does NOT block `git commit`. Another agent may have committed
# straight to local `main` without pushing, leaving work that:
#   - is invisible on origin/main
#   - silently overrides what fresh worktrees see when they branch off origin
#   - can be lost if anyone resets local main
# Surface those commits so the next agent investigates before working.
# ---------------------------------------------------------------------------
bold "5. Unpushed commits in /home/whisper/marketplace (shared repo)"
SHARED_REPO="/home/whisper/marketplace"
if [ -d "$SHARED_REPO/.git" ] || [ -f "$SHARED_REPO/.git" ]; then
  SHARED_BRANCH="$(git -C "$SHARED_REPO" branch --show-current 2>/dev/null || echo '')"
  if [ -n "$SHARED_BRANCH" ]; then
    UPSTREAM="$(git -C "$SHARED_REPO" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')"
    if [ -z "$UPSTREAM" ]; then
      warn "   ⚠ branch '$SHARED_BRANCH' has no upstream — cannot check ahead/behind."
    else
      AHEAD="$(git -C "$SHARED_REPO" log "$UPSTREAM..HEAD" --oneline 2>/dev/null || true)"
      if [ -n "$AHEAD" ]; then
        AHEAD_COUNT="$(echo "$AHEAD" | wc -l | tr -d ' ')"
        err  "   ⚠ $AHEAD_COUNT commit(s) ahead of $UPSTREAM on '$SHARED_BRANCH':"
        echo "$AHEAD" | while IFS= read -r line; do
          err "     $line"
        done
        err  "   → another agent may have committed locally without pushing."
        err  "     Investigate before working — fresh worktrees branch off origin and"
        err  "     will NOT see these changes."
      else
        ok "   none — local '$SHARED_BRANCH' is in sync with $UPSTREAM."
      fi
    fi
  else
    dim "   shared repo is in detached HEAD; skipping ahead/behind check."
  fi
else
  dim "   $SHARED_REPO not present; skipping."
fi
echo

# ---------------------------------------------------------------------------
# 6. Active deploy locks (compose project being recreated by someone else)
# ---------------------------------------------------------------------------
# Surfaces the per-environment flock added in #1293. If another agent is
# mid-deploy of `marketplaceprod`, this section lights up so the current
# session knows NOT to start its own `npm run deploy:prod` — that would
# race the `docker-compose up`, leave one agent's Traefik labels
# orphaned, and serve 502s for ~30s. See the 2026-05-04 incident.
bold "6. Active deploy locks"
LOCK_DIR="${MP_DEPLOY_LOCK_DIR:-/tmp/marketplace-locks}"
if [ ! -d "$LOCK_DIR" ]; then
  ok "   none."
else
  any_lock=0
  any_stale=0
  for lock_file in "$LOCK_DIR"/deploy-*.lock; do
    [ -e "$lock_file" ] || continue
    project="${lock_file##*/deploy-}"
    project="${project%.lock}"
    # Held = another process has an exclusive flock on it. Subshell
    # opens the file on fd 9 and tries an exclusive non-blocking lock;
    # nonzero exit means the lock IS held by someone else.
    if ( exec 9>"$lock_file"; flock -n -x 9 ) 2>/dev/null; then
      any_stale=1
      dim "   stale lockfile (not held): $lock_file"
      dim "     remove with: rm '$lock_file'"
    else
      any_lock=1
      # Map compose project name back to the convenient npm script name.
      env_short="${project#marketplace}"
      case "$env_short" in
        prod) deploy_cmd="npm run deploy:prod" ;;
        stg)  deploy_cmd="npm run deploy:staging" ;;
        dev)  deploy_cmd="npm run deploy:dev" ;;
        *)    deploy_cmd="npm run deploy:$env_short" ;;
      esac
      warn "   ⚠  $project deploy IN PROGRESS — do NOT '$deploy_cmd'"
      # Echo metadata so the current session can see who/when/what.
      # The `cat` runs OUTSIDE the (subshell flock test) so it doesn't
      # try to acquire its own lock — it just reads the file content.
      if [ -s "$lock_file" ]; then
        while IFS= read -r line; do
          echo "      $line"
        done < "$lock_file"
      else
        dim "      (lock held but metadata file empty)"
      fi
    fi
  done
  if [ "$any_lock" = 0 ] && [ "$any_stale" = 0 ]; then
    ok "   none."
  fi
fi
echo

# ---------------------------------------------------------------------------
# 7. Hint
# ---------------------------------------------------------------------------
dim "For deep cleanup signals (gone branches, merged worktrees, etc.) run:"
dim "  scripts/git-hygiene.sh"
echo

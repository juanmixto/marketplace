#!/usr/bin/env bash
# scripts/git-hygiene.sh
#
# Reports git state that suggests cleanup is due. Read-only by default —
# this script never deletes anything without an explicit prompt.
#
# Companion to docs/git-workflow.md.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
err()   { printf '\033[31m%s\033[0m\n' "$*"; }
ok()    { printf '\033[32m%s\033[0m\n' "$*"; }

echo
bold "git-hygiene — read-only report"
echo

# ---------------------------------------------------------------------------
# 1. Refresh remote view
# ---------------------------------------------------------------------------
bold "1. Pruning stale remote-tracking refs"
git fetch --prune --quiet
ok   "   done."
echo

# ---------------------------------------------------------------------------
# 2. Branches whose upstream is gone
# ---------------------------------------------------------------------------
bold "2. Local branches with [gone] upstream"
gone=$(git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads \
       | awk '$2 == "[gone]" {print $1}')

if [ -z "$gone" ]; then
  ok "   none."
else
  while IFS= read -r br; do
    unique=$(git rev-list --count "main..$br" 2>/dev/null || echo "?")
    if [ "$unique" = "0" ]; then
      warn "   $br  (no unique commits — safe to delete)"
    else
      err  "   $br  ($unique unique commits — back up to rescue/<name> before deleting)"
    fi
  done <<< "$gone"
fi
echo

# ---------------------------------------------------------------------------
# 3. Worktrees whose branch is gone
# ---------------------------------------------------------------------------
bold "3. Worktrees pointing at deleted/missing branches"
git worktree list --porcelain \
  | awk '
      /^worktree / {wt=$2}
      /^branch /   {br=$2; print wt "\t" br}
      /^detached/  {print wt "\tdetached"}
    ' \
  | while IFS=$'\t' read -r wt br; do
      [ "$wt" = "$(pwd)" ] && continue
      if [ "$br" = "detached" ]; then
        warn "   $wt  (detached HEAD)"
      else
        short=${br#refs/heads/}
        if ! git show-ref --quiet --verify "$br"; then
          err "   $wt  (branch $short is gone)"
        fi
      fi
    done
ok   "   (no output above means all worktrees are clean)"
echo

# ---------------------------------------------------------------------------
# 4. Stashes older than 24h
# ---------------------------------------------------------------------------
bold "4. Stashes older than 24 hours"
now=$(date +%s)
threshold=$((24 * 3600))
found_stash=0
git stash list --format='%gd|%ct|%s' 2>/dev/null | while IFS='|' read -r ref ts subject; do
  [ -z "$ref" ] && continue
  age=$((now - ts))
  if [ $age -gt $threshold ]; then
    days=$((age / 86400))
    err "   $ref  ${days}d old — $subject"
    found_stash=1
  fi
done
[ $found_stash -eq 0 ] && ok "   none."
echo

# ---------------------------------------------------------------------------
# 5. Non-fast-forward divergence with origin
# ---------------------------------------------------------------------------
bold "5. Local branches diverged from origin (non-fast-forward)"
diverged=0
git for-each-ref --format='%(refname:short) %(upstream:short)' refs/heads | \
while read -r local remote; do
  [ -z "$remote" ] && continue
  if ! git rev-parse --verify --quiet "$remote" >/dev/null; then continue; fi
  ahead=$(git rev-list --count "$remote..$local" 2>/dev/null || echo 0)
  behind=$(git rev-list --count "$local..$remote" 2>/dev/null || echo 0)
  if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
    err "   $local  (ahead $ahead, behind $behind — diverged)"
    diverged=1
  fi
done
[ $diverged -eq 0 ] && ok "   none."
echo

bold "Done. See docs/git-workflow.md for the cleanup playbook."

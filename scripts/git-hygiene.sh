#!/usr/bin/env bash
# scripts/git-hygiene.sh
#
# Reports git state that suggests cleanup is due. Read-only by default;
# pass --clean for an interactive bulk-removal of safe-to-prune worktrees
# and [gone] branches (with rescue/* backups for any unique commits).
#
# Companion to docs/git-workflow.md.

set -euo pipefail

CLEAN_MODE=0
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN_MODE=1 ;;
    -h|--help)
      cat <<USAGE
Usage: scripts/git-hygiene.sh [--clean]

  (no flag)  Read-only report of branches/worktrees/stashes due for cleanup.
  --clean    After the report, interactively bulk-remove worktrees whose PR
             is MERGED or whose branch is [gone] upstream. Local branches
             with unique commits are renamed to rescue/<name> first so no
             work is lost. Stops to confirm before any destructive action.
USAGE
      exit 0
      ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
err()   { printf '\033[31m%s\033[0m\n' "$*"; }
ok()    { printf '\033[32m%s\033[0m\n' "$*"; }

echo
if [ "$CLEAN_MODE" -eq 1 ]; then
  bold "git-hygiene — clean mode (interactive)"
else
  bold "git-hygiene — read-only report"
fi
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
bold "2. Local branches with [gone] upstream (excluding rescue/*)"
# rescue/* branches are intentional local-only backups created by previous
# --clean runs; their upstream tracking is moot. Filter them out here so
# the report shows actionable items.
gone=$(git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads \
       | awk '$2 == "[gone]" {print $1}' \
       | grep -v '^rescue/' || true)

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

# ---------------------------------------------------------------------------
# 6. Optional: --clean mode — interactive bulk cleanup
#
# Lessons from the 2026-05-07 cleanup (176 worktrees / 59 GB):
#   - `gh pr merge --auto --squash --delete-branch` only removes the
#     remote branch, leaving the worktree + local branch behind. Without
#     a periodic sweep these accumulate to hundreds.
#   - Squash-merged branches are NOT ancestors of main, so the right
#     signal for "PR-MERGED" is gh pr list --state merged, NOT
#     git merge-base --is-ancestor.
#   - gh pr list --limit silently caps. This repo has >700 historic PRs
#     so we use --limit 2000 (cheap, single API call).
#   - Always rename branches with unique commits to rescue/<name> first
#     so we can recover anything mis-classified.
# ---------------------------------------------------------------------------
if [ "$CLEAN_MODE" -eq 1 ]; then
  bold "6. Clean mode — classify worktrees and propose removals"

  if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
    err "   gh is not authenticated; --clean cannot classify by PR state. Aborting."
    exit 1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    err "   jq is required for --clean. Install it and retry."
    exit 1
  fi

  PR_DUMP="$(mktemp -t git-hygiene-prs.XXXXXX)"
  trap 'rm -f "$PR_DUMP"' EXIT
  echo "   Fetching PR index (state=all, limit=2000)..."
  gh pr list --state all --limit 2000 \
    --json headRefName,state,number \
    -q '.[] | "\(.headRefName)|\(.state)|\(.number)"' > "$PR_DUMP"
  pr_count=$(wc -l < "$PR_DUMP" | tr -d ' ')
  echo "   PRs indexed: $pr_count"
  echo

  # Worktrees to consider: all under /home/whisper/worktrees/, never the
  # current cwd (we'd be removing the script's home), never the shared
  # repo itself, never load-bearing detached HEADs.
  PROTECTED_WTS=(
    "/home/whisper/worktrees/main-preview"
    "/home/whisper/worktrees/release-current"
  )
  is_protected() {
    local wt="$1"
    for p in "${PROTECTED_WTS[@]}"; do
      [ "$wt" = "$p" ] && return 0
    done
    return 1
  }

  CWD_TOP="$(git rev-parse --show-toplevel)"
  SHARED_REPO="/home/whisper/marketplace"

  SAFE_WTS=()        # PR-MERGED / branch in main / [gone] upstream + clean tree
  SKIP_DIRTY_WTS=()  # would otherwise be safe but has uncommitted changes
  KEEP_WTS=()        # PR-OPEN
  REVIEW_WTS=()      # PR-CLOSED / NO-PR / DETACHED

  while IFS='|' read -r wt br; do
    [ -z "$wt" ] && continue
    [ "$wt" = "$SHARED_REPO" ] && continue
    [ "$wt" = "$CWD_TOP" ] && continue
    is_protected "$wt" && continue

    if [ "$br" = "DETACHED" ]; then
      REVIEW_WTS+=("$wt|(detached)|DETACHED")
      continue
    fi
    br_short="${br#refs/heads/}"

    # Dirty? Don't auto-remove uncommitted work.
    dirty=$(git -C "$wt" status --short 2>/dev/null | wc -l | tr -d ' ')

    # Classify by PR state, then by ancestry, then by upstream.
    pr_line=$(grep -F "${br_short}|" "$PR_DUMP" | head -1 || true)
    pr_state="${pr_line#${br_short}|}"; pr_state="${pr_state%|*}"

    classification=""
    if [ "$pr_state" = "OPEN" ]; then
      classification="KEEP"
    elif [ "$pr_state" = "MERGED" ]; then
      classification="SAFE"
    elif git merge-base --is-ancestor "$br" origin/main 2>/dev/null; then
      classification="SAFE"
    else
      track=$(git for-each-ref --format='%(upstream:track)' "$br" 2>/dev/null)
      if [ "$track" = "[gone]" ]; then
        classification="SAFE"
      elif [ "$pr_state" = "CLOSED" ]; then
        classification="REVIEW"
      else
        classification="REVIEW"
      fi
    fi

    case "$classification" in
      SAFE)
        if [ "$dirty" -gt 0 ]; then
          SKIP_DIRTY_WTS+=("$wt|$br_short|DIRTY-${dirty}")
        else
          SAFE_WTS+=("$wt|$br_short")
        fi
        ;;
      KEEP)   KEEP_WTS+=("$wt|$br_short") ;;
      REVIEW) REVIEW_WTS+=("$wt|$br_short|${pr_state:-NO-PR}") ;;
    esac
  done < <(git worktree list --porcelain | awk '
    /^worktree / {wt=$2}
    /^branch /   {print wt "|" $2}
    /^detached/  {print wt "|DETACHED"}
  ')

  echo "   Safe to remove (PR merged / branch in main / upstream gone):"
  if [ "${#SAFE_WTS[@]}" -eq 0 ]; then
    ok   "     none."
  else
    for entry in "${SAFE_WTS[@]}"; do
      IFS='|' read -r wt br <<< "$entry"
      printf '     %-55s %s\n' "$(basename "$wt")" "$br"
    done
  fi
  echo

  if [ "${#SKIP_DIRTY_WTS[@]}" -gt 0 ]; then
    warn "   DIRTY (would be safe but has uncommitted changes — left alone):"
    for entry in "${SKIP_DIRTY_WTS[@]}"; do
      IFS='|' read -r wt br dirty <<< "$entry"
      printf '     %-55s %s  %s\n' "$(basename "$wt")" "$br" "$dirty"
    done
    echo
  fi

  if [ "${#REVIEW_WTS[@]}" -gt 0 ]; then
    warn "   Manual review (PR closed without merge / no PR / detached):"
    for entry in "${REVIEW_WTS[@]}"; do
      IFS='|' read -r wt br state <<< "$entry"
      printf '     %-55s %s  [%s]\n' "$(basename "$wt")" "$br" "$state"
    done
    echo
  fi

  if [ "${#KEEP_WTS[@]}" -gt 0 ]; then
    ok "   In-flight (PR open — keeping):"
    for entry in "${KEEP_WTS[@]}"; do
      IFS='|' read -r wt br <<< "$entry"
      printf '     %-55s %s\n' "$(basename "$wt")" "$br"
    done
    echo
  fi

  if [ "${#SAFE_WTS[@]}" -eq 0 ] && [ -z "$gone" ]; then
    ok "   Nothing to remove. Done."
    exit 0
  fi

  printf 'Proceed with removal (rescue/<name> backup for unique commits)? [y/N] '
  read -r confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi

  echo
  bold "Removing worktrees..."
  removed=0
  for entry in "${SAFE_WTS[@]}"; do
    IFS='|' read -r wt br <<< "$entry"
    # Backup branch to rescue/* if it has commits not in main.
    if [ -n "$br" ] && git rev-parse --verify "$br" >/dev/null 2>&1; then
      unique=$(git rev-list --count "origin/main..$br" 2>/dev/null || echo 0)
      if [ "$unique" -gt 0 ] && ! git rev-parse --verify "rescue/$br" >/dev/null 2>&1; then
        git branch -m "$br" "rescue/$br" 2>/dev/null && \
          ok "   rescued $br -> rescue/$br" || true
      fi
    fi
    if git worktree remove --force "$wt" 2>/dev/null; then
      removed=$((removed + 1))
    else
      err "   FAILED to remove $wt"
    fi
  done
  ok "   $removed worktree(s) removed."
  echo

  # Also clean up [gone] branches that no longer have a worktree.
  bold "Cleaning [gone] local branches (rescue/* backup if unique commits)..."
  cleaned=0
  while IFS= read -r br; do
    [ -z "$br" ] && continue
    [ "$br" = "$(git branch --show-current)" ] && continue
    # Skip rescue/* — these are intentional backups; leaving them with a
    # [gone] upstream is fine (renaming to rescue/rescue/* would be silly).
    case "$br" in rescue/*) continue ;; esac
    # Skip if a worktree still has it checked out.
    if git worktree list --porcelain | grep -q "^branch refs/heads/${br}$"; then
      continue
    fi
    unique=$(git rev-list --count "origin/main..$br" 2>/dev/null || echo 0)
    if [ "$unique" -gt 0 ]; then
      if ! git rev-parse --verify "rescue/$br" >/dev/null 2>&1; then
        git branch -m "$br" "rescue/$br" 2>/dev/null && \
          ok "   rescued $br -> rescue/$br" && cleaned=$((cleaned + 1))
      fi
    else
      git branch -D "$br" >/dev/null 2>&1 && cleaned=$((cleaned + 1))
    fi
  done < <(git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | awk '$2 == "[gone]" {print $1}')
  ok "   $cleaned local branch(es) processed."
  echo
fi

bold "Done. See docs/git-workflow.md for the cleanup playbook."

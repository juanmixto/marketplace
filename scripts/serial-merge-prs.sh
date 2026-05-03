#!/usr/bin/env bash
# scripts/serial-merge-prs.sh
#
# Merge a list of PRs in order against main, the right way.
#
# Usage:  scripts/serial-merge-prs.sh PR1 [PR2 ...]
#
# Encodes the lessons from the 2026-05-03 batch-merge incident:
#
#   - After update-branch, if changed_files=0 the PR is a no-op:
#     close it instead of waiting forever for an auto-merge that
#     can't fire (memory: feedback_check_diff_after_update_branch).
#
#   - The wait loop must detect BEHIND, not just OPEN→MERGED. When
#     a sibling PR merges first, the next PR goes BEHIND and the
#     `auto-update-pr-branches` workflow needs up to 30 min to
#     react — kick it ourselves to avoid that wait
#     (memory: feedback_track_all_open_prs).
#
#   - `gh pr merge --delete-branch` fails silently when a local
#     worktree points at the PR branch; clean up worktrees + remote
#     refs after the merge (memory: reference_gh_pr_merge_delete_branch_quirk).
#
# Aborts the batch on: conflict that update-branch can't auto-resolve,
# any required check failure, or a PR whose base != main.
#
# All actions print to stdout. Read what it does before re-running.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 PR_NUMBER [PR_NUMBER ...]" >&2
  exit 2
fi

owner_repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
poll_seconds="${POLL_SECONDS:-30}"
ci_start_timeout="${CI_START_TIMEOUT:-180}"

log()  { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
fail() { log "ABORT: $*"; exit 1; }

# Precondition: every PR has base=main, is OPEN, no DIRTY conflicts.
log "preflight: $# PR(s)"
for pr in "$@"; do
  state="$(gh pr view "$pr" --json state,baseRefName,mergeable,mergeStateStatus \
           --jq '"\(.state):\(.baseRefName):\(.mergeable):\(.mergeStateStatus)"')"
  IFS=: read -r s b m ms <<<"$state"
  [[ "$s"  == "OPEN" ]] || fail "#$pr is $s, not OPEN"
  [[ "$b"  == "main" ]] || fail "#$pr base is '$b', not main"
  [[ "$m"  != "CONFLICTING" ]] || fail "#$pr conflicts (mergeable=$m); resolve manually"
  [[ "$ms" != "DIRTY" ]] || fail "#$pr conflicts (mergeState=$ms); resolve manually"
  log "  #$pr OK ($ms)"
done

merged=()
closed_obsolete=()

for pr in "$@"; do
  log "----- #$pr -----"

  log "  triggering update-branch"
  upd="$(gh api -X PUT "repos/$owner_repo/pulls/$pr/update-branch" 2>&1 || true)"
  if echo "$upd" | grep -q '"status":"422"'; then
    if echo "$upd" | grep -qi conflict; then
      fail "#$pr update-branch hit a conflict — resolve manually then re-run"
    fi
    # 422 with no conflict means "already up to date" — fine.
  fi

  # Wait for GitHub to compute the new diff.
  for _ in 1 2 3 4 5 6; do
    sleep 5
    changed="$(gh api "repos/$owner_repo/pulls/$pr" --jq '.changed_files' 2>/dev/null || echo 0)"
    [[ -n "$changed" ]] && break
  done

  if [[ "${changed:-0}" -eq 0 ]]; then
    log "  changed_files=0 after rebase — closing as obsolete (no-op)"
    gh pr close "$pr" --comment "Cierro: tras rebase contra main el diff es 0 (cambio ya integrado)." \
      >/dev/null
    closed_obsolete+=("$pr")
    continue
  fi
  log "  changed_files=$changed"

  log "  arming auto-merge"
  gh pr merge "$pr" --auto --squash --delete-branch >/dev/null 2>&1 || true

  # Poll until terminal. Re-trigger update-branch on BEHIND so we
  # don't wait the 30 min cron of auto-update-pr-branches.
  log "  waiting (poll=${poll_seconds}s, BEHIND-aware)"
  while :; do
    sleep "$poll_seconds"
    info="$(gh pr view "$pr" --json state,mergeStateStatus,statusCheckRollup \
            --jq '{s: .state, ms: .mergeStateStatus, failed: [.statusCheckRollup[] | select(.conclusion == "FAILURE") | (.name // .context)]}')"
    s="$(echo "$info"  | jq -r .s)"
    ms="$(echo "$info" | jq -r .ms)"
    if [[ "$s" == "MERGED" ]]; then
      log "  ✓ merged"
      merged+=("$pr")
      break
    fi
    if [[ "$s" == "CLOSED" ]]; then
      fail "#$pr was CLOSED while waiting (someone closed it manually?)"
    fi
    case "$ms" in
      CLEAN|UNSTABLE|HAS_HOOKS) : ;; # auto-merge will fire
      BEHIND)
        log "  state=BEHIND, kicking update-branch"
        gh api -X PUT "repos/$owner_repo/pulls/$pr/update-branch" >/dev/null 2>&1 || true
        ;;
      DIRTY)
        fail "#$pr now has conflicts after a sibling merge — resolve manually"
        ;;
      BLOCKED)
        # Most common: a non-required check is red (Vercel rate-limit).
        # If a *required* check failed, surface the names.
        failed_names="$(echo "$info" | jq -r '.failed | join(", ")')"
        if [[ -n "$failed_names" && "$failed_names" != "Vercel" ]]; then
          fail "#$pr blocked by failing checks: $failed_names"
        fi
        ;;
      *) log "  state=$s mergeState=$ms (continuing)" ;;
    esac
  done
done

# Post-merge cleanup: --delete-branch fails silently when a local
# worktree pins the branch. Mop up.
log "----- cleanup -----"
for pr in "${merged[@]}"; do
  branch="$(gh pr view "$pr" --json headRefName --jq .headRefName 2>/dev/null || echo '')"
  [[ -z "$branch" ]] && continue
  wt="$(git worktree list --porcelain | awk -v b="refs/heads/$branch" '
    /^worktree / { path=$2 } /^branch / && $2==b { print path; exit }')"
  if [[ -n "$wt" ]]; then
    log "  removing worktree $wt"
    git worktree remove "$wt" 2>&1 | sed 's/^/    /' || true
  fi
  if git rev-parse --verify "$branch" >/dev/null 2>&1; then
    git branch -D "$branch" 2>&1 | sed 's/^/    /' || true
  fi
  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    log "  deleting remote $branch"
    git push origin --delete "$branch" 2>&1 | tail -1 | sed 's/^/    /' || true
  fi
done

log "summary: merged=${#merged[@]} closed_obsolete=${#closed_obsolete[@]}"
[[ "${#merged[@]}" -gt 0 ]] && log "  merged: ${merged[*]}"
[[ "${#closed_obsolete[@]}" -gt 0 ]] && log "  closed (no-op): ${closed_obsolete[*]}"

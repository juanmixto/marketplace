#!/usr/bin/env bash
# scripts/agent-stop-checks.sh
#
# End-of-turn safety checks for agents. Designed to be called from a
# Claude Code `Stop` hook so the agent can't quietly leave behind
# state that would surprise the next session or another agent.
#
# Companion to scripts/agents-status.sh (session-start) and
# AGENTS.md § "Before your first tool call".
#
# Exits 0 (silent) if everything is clean. Prints findings to stdout
# and exits 0 anyway — the caller hook decides whether to surface them.

set -euo pipefail

SHARED_REPO="/home/whisper/marketplace"
findings=()

# ---------------------------------------------------------------------------
# 1. Unpushed commits in the SHARED main repo (the dangerous case)
#
# Same check as agents-status.sh § 5. The wrapper at ~/.local/bin/git
# blocks state mutations but NOT `git commit`, so a session can end
# with commits that exist only on this laptop. The next agent that
# branches off origin/main won't see them.
# ---------------------------------------------------------------------------
if [[ -d "$SHARED_REPO/.git" || -f "$SHARED_REPO/.git" ]]; then
  shared_branch="$(git -C "$SHARED_REPO" branch --show-current 2>/dev/null || echo '')"
  if [[ -n "$shared_branch" ]]; then
    upstream="$(git -C "$SHARED_REPO" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || echo '')"
    if [[ -n "$upstream" ]]; then
      ahead="$(git -C "$SHARED_REPO" log "$upstream..HEAD" --oneline 2>/dev/null || true)"
      if [[ -n "$ahead" ]]; then
        ahead_count="$(echo "$ahead" | wc -l | tr -d ' ')"
        findings+=(
          "⚠ ${ahead_count} commit(s) in /home/whisper/marketplace ahead of ${upstream}:"
        )
        while IFS= read -r line; do
          findings+=("    $line")
        done <<< "$ahead"
        findings+=(
          "  → Push to origin or surface to user before ending the session."
          "    Otherwise the next agent will branch off origin/main and miss the work."
        )
      fi
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 2. Stale session note (>4h since last touch and >0 lines committed/pushed today)
#
# We only nag if the agent did real work (commits today) but the
# session note hasn't been touched since the work started. This is a
# soft signal — many tasks legitimately end without a session note.
# ---------------------------------------------------------------------------
sessions_dir="$SHARED_REPO/.claude/sessions"
if [[ -d "$sessions_dir" ]]; then
  today_iso="$(date +%Y-%m-%d)"
  todays_note="$(find "$sessions_dir" -maxdepth 1 -type f -name "${today_iso}-*.md" 2>/dev/null | head -1)"
  if [[ -n "$todays_note" ]]; then
    note_mtime=$(stat -c %Y "$todays_note" 2>/dev/null || echo 0)
    now=$(date +%s)
    age_hours=$(( (now - note_mtime) / 3600 ))
    if [[ "$age_hours" -gt 4 ]]; then
      findings+=(
        "ℹ Session note ${todays_note##*/} hasn't been touched in ${age_hours}h."
        "  → If you did meaningful work this turn, append a one-liner before ending."
      )
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 3. Open PRs by current gh user with auto-merge armed but stuck
#
# When you set --auto on multiple PRs in one session, the GitHub
# auto-update-pr-branches workflow USUALLY rebases them as main moves,
# but: (a) the workflow runs on a 30 min cron + on push, so a session
# that ends right after a push may leave PRs BEHIND for 30 min;
# (b) PRs whose rebase produces an empty diff (changed_files=0) sit
# in BLOCKED forever — auto-merge cannot fire on a no-op merge.
# (c) PRs whose required check failed silently (Verify, lint).
#
# The 2026-05-03 batch (10 PRs in serial) tripped on (b) once and
# the user had to surface "no veo CI corriendo" before I noticed.
# This check makes the failure mode loud at end-of-turn.
#
# Skipped if `gh` is not authenticated (offline / fresh laptop).
# ---------------------------------------------------------------------------
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh_user="$(gh api user --jq .login 2>/dev/null || echo '')"
  if [[ -n "$gh_user" ]]; then
    # State + mergeState for every OPEN PR by this user with auto-merge enabled.
    stuck_json="$(gh pr list \
      --author "$gh_user" --state open --limit 50 \
      --json number,title,mergeStateStatus,autoMergeRequest \
      --jq '[.[] | select(.autoMergeRequest != null) | select(.mergeStateStatus != "CLEAN" and .mergeStateStatus != "UNSTABLE" and .mergeStateStatus != "HAS_HOOKS")]' \
      2>/dev/null || echo '[]')"
    stuck_count="$(echo "$stuck_json" | jq 'length' 2>/dev/null || echo 0)"
    if [[ "${stuck_count:-0}" -gt 0 ]]; then
      findings+=(
        "⚠ ${stuck_count} of your PR(s) have auto-merge armed but are stuck:"
      )
      while IFS= read -r line; do
        findings+=("    $line")
      done < <(echo "$stuck_json" | jq -r '.[] | "  #\(.number) [\(.mergeStateStatus)] \(.title)"' 2>/dev/null)
      findings+=(
        "  → Likely BEHIND (auto-update-pr-branches will catch up within 30 min)"
        "    or BLOCKED (changed_files=0 after rebase → close as obsolete)"
        "    or required check failing (run \`gh pr checks <N>\` to see which)."
      )
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 4. Issue hygiene — merged-but-not-closed and stale in-progress
#
# This repo is a USER repo (juanmixto/marketplace), not an org, so
# GitHub native Issue Types are unavailable. We coordinate through
# labels: `in-progress` is supposed to advertise WIP across concurrent
# agents, and `Closes #N` in the PR body is supposed to auto-close the
# issue at merge.
#
# Failure modes this catches:
#   (a) PR merged but the linked issue is still OPEN — usually because
#       the closing keyword was missing in the PR body. Auto-close also
#       does NOT remove labels, so `in-progress` lingers either way.
#   (b) Issues with `in-progress` that haven't been touched in >48h —
#       likely abandoned or forgotten WIP, looks like active work to
#       the next agent.
#
# User flagged this 2026-05-04: 0 issues had `in-progress` despite
# active multi-agent work, and several recently-fixed issues were
# still OPEN. See memory/feedback_issue_workflow.md.
#
# Skipped if `gh` is not authenticated.
# ---------------------------------------------------------------------------
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  gh_user="${gh_user:-$(gh api user --jq .login 2>/dev/null || echo '')}"
  if [[ -n "$gh_user" ]]; then
    # 4a. PRs by current user merged in the last 24h — check each
    # referenced issue (Closes/Fixes/Resolves #N) is CLOSED.
    since_iso="$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo '')"
    if [[ -n "$since_iso" ]]; then
      recent_merged="$(gh pr list \
        --author "$gh_user" --state merged --limit 20 \
        --search "merged:>=${since_iso}" \
        --json number,title,body,mergedAt 2>/dev/null || echo '[]')"
      stuck_issues=()
      while IFS=$'\t' read -r pr_num issue_num; do
        [[ -z "$issue_num" ]] && continue
        state="$(gh issue view "$issue_num" --json state --jq .state 2>/dev/null || echo '')"
        if [[ "$state" == "OPEN" ]]; then
          stuck_issues+=("    #${issue_num} (referenced by merged PR #${pr_num}) is still OPEN")
        fi
      done < <(echo "$recent_merged" | jq -r '
        .[] | . as $pr |
        ($pr.body // "") |
        [ scan("(?i)\\b(?:closes|fixes|resolves)\\s+#([0-9]+)") ] |
        .[] | "\($pr.number)\t\(.[0])"
      ' 2>/dev/null)
      if [[ "${#stuck_issues[@]}" -gt 0 ]]; then
        findings+=(
          "⚠ ${#stuck_issues[@]} issue(s) referenced by your recently-merged PRs are still OPEN:"
        )
        for line in "${stuck_issues[@]}"; do
          findings+=("$line")
        done
        findings+=(
          "  → Likely the PR body was missing 'Closes #N'. Close manually:"
          "    gh issue close <N> --comment \"Resuelto en #<PR>\""
        )
      fi
    fi

    # 4b. Issues labelled `in-progress` with no activity in >48h.
    stale_wip="$(gh issue list \
      --label "in-progress" --state open --limit 30 \
      --json number,title,updatedAt \
      --jq "[.[] | select((.updatedAt | fromdateiso8601) < (now - 48*3600))]" \
      2>/dev/null || echo '[]')"
    stale_count="$(echo "$stale_wip" | jq 'length' 2>/dev/null || echo 0)"
    if [[ "${stale_count:-0}" -gt 0 ]]; then
      findings+=(
        "ℹ ${stale_count} issue(s) labelled in-progress with no activity in >48h:"
      )
      while IFS= read -r line; do
        findings+=("    $line")
      done < <(echo "$stale_wip" | jq -r '.[] | "  #\(.number) \(.title)"' 2>/dev/null)
      findings+=(
        "  → If still WIP, comment with status. If abandoned, remove label:"
        "    gh issue edit <N> --remove-label \"in-progress\""
      )
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if [[ "${#findings[@]}" -eq 0 ]]; then
  exit 0
fi

echo "[agent-stop-checks] end-of-turn warnings:"
for line in "${findings[@]}"; do
  echo "  $line"
done
echo
echo "  Useful follow-ups:"
echo "    bash scripts/audit-prs-behind.sh             # see your PRs that need a rebase"
echo "    bash scripts/audit-prs-behind.sh --rebase    # batch rebase + push"
echo "    bash scripts/issue-sweep.sh                  # find ghost-open issues to verify + close"
exit 0

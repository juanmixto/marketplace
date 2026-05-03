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
# Output
# ---------------------------------------------------------------------------
if [[ "${#findings[@]}" -eq 0 ]]; then
  exit 0
fi

echo "[agent-stop-checks] end-of-turn warnings:"
for line in "${findings[@]}"; do
  echo "  $line"
done
exit 0

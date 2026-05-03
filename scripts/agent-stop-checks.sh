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

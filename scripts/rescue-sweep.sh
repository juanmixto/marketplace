#!/usr/bin/env bash
# scripts/rescue-sweep.sh
#
# Lists local `rescue/*` branches and (with --delete) bulk-removes those
# older than --days N (default 30). rescue/* branches are intentional
# local-only backups created by `git-hygiene.sh --clean` to preserve any
# unique commits before removing the original branch — useful as a 30-day
# safety net, dead weight after that.
#
# Usage:
#   bash scripts/rescue-sweep.sh                  # report only
#   bash scripts/rescue-sweep.sh --delete         # interactive bulk delete >30d
#   bash scripts/rescue-sweep.sh --delete --days 60
#
# Always read-only by default. The --delete prompt requires y/Y to proceed.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

bold()  { printf '\033[1m%s\033[0m\n' "$*"; }
warn()  { printf '\033[33m%s\033[0m\n' "$*"; }
err()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }
ok()    { printf '\033[32m%s\033[0m\n' "$*"; }
dim()   { printf '\033[2m%s\033[0m\n' "$*"; }

DELETE=0
DAYS=30
while [ $# -gt 0 ]; do
  case "$1" in
    --delete)  DELETE=1; shift ;;
    --days)    DAYS="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) err "Unknown arg: $1"; exit 2 ;;
  esac
done

THRESHOLD_SEC=$((DAYS * 86400))
NOW=$(date +%s)

echo
bold "rescue-sweep — local rescue/* branches (threshold: ${DAYS}d)"
echo

ALL=()
OLD=()

while IFS= read -r br; do
  [ -z "$br" ] && continue
  tip_ts=$(git log -1 --format=%ct "$br" 2>/dev/null || echo 0)
  age_days=$(( (NOW - tip_ts) / 86400 ))
  unique=$(git rev-list --count "origin/main..$br" 2>/dev/null || echo 0)
  subject=$(git log -1 --format='%s' "$br" 2>/dev/null | head -c 70)
  ALL+=("${age_days}d|${br}|${unique}|${subject}")
  if [ "$age_days" -gt "$DAYS" ]; then
    OLD+=("$br")
  fi
done < <(git for-each-ref --format='%(refname:short)' 'refs/heads/rescue/**')

if [ "${#ALL[@]}" -eq 0 ]; then
  ok "   No rescue/* branches. Nothing to do."
  exit 0
fi

echo "   Total: ${#ALL[@]}    Older than ${DAYS}d: ${#OLD[@]}"
echo
printf '   %-6s  %-50s  %-7s  %s\n' "AGE" "BRANCH" "UNIQUE" "LAST COMMIT"
printf '   %-6s  %-50s  %-7s  %s\n' "---" "------" "------" "-----------"
# Sort oldest-first so action items land at the top.
for entry in "${ALL[@]}"; do echo "$entry"; done | sort -t'|' -k1,1 -n -r | while IFS='|' read -r age br unique subject; do
  if [ "${age%d}" -gt "$DAYS" ]; then
    err  "$(printf '   %-6s  %-50s  %-7s  %s' "$age" "$br" "$unique" "$subject")"
  else
    dim  "$(printf '   %-6s  %-50s  %-7s  %s' "$age" "$br" "$unique" "$subject")"
  fi
done
echo

if [ "$DELETE" -eq 0 ]; then
  if [ "${#OLD[@]}" -gt 0 ]; then
    warn "   ${#OLD[@]} branch(es) older than ${DAYS}d. Re-run with --delete to bulk-remove them."
  fi
  exit 0
fi

if [ "${#OLD[@]}" -eq 0 ]; then
  ok "   No rescue/* branches older than ${DAYS}d. Nothing to delete."
  exit 0
fi

bold "About to delete ${#OLD[@]} rescue/* branches older than ${DAYS} days."
echo "   These are local-only backups; deletion is irreversible (no remote ref)."
echo "   Branches with unique commits are listed in red above — review before confirming."
printf "Proceed? [y/N] "
read -r confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 0
fi

echo
bold "Deleting..."
deleted=0
failed=0
for br in "${OLD[@]}"; do
  if git branch -D "$br" >/dev/null 2>&1; then
    ok "   deleted $br"
    deleted=$((deleted + 1))
  else
    err "   FAILED $br (still checked out somewhere?)"
    failed=$((failed + 1))
  fi
done
echo
ok "   $deleted deleted, $failed failed."

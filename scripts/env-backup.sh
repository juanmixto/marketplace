#!/usr/bin/env bash
# Rotate a copy of an env file into ~/.config/raizdirecta/env-backups/ before editing it.
#
# Why this exists:
#   Editing .env.production in place leaves no trail. Copying to .env.production.bak.<ts>
#   in the repo root pollutes the cwd shared by every agent (agents-status.sh flags the
#   files as WIP, .gitignore had no pattern for them, and a `git add -A` could commit
#   secrets). See issue #1313.
#
# Usage:
#   scripts/env-backup.sh .env.production
#   scripts/env-backup.sh .env.staging
#
# Behaviour:
#   - Backups go to $RAIZ_ENV_BACKUP_DIR (default: ~/.config/raizdirecta/env-backups/).
#   - File name: <basename>.<UTC-ISO>.bak  (sortable, human-readable, no clock-skew ties).
#   - Permissions copied (umask 077 honoured).
#   - Retention: keeps the 14 most recent per source file; older are deleted.

set -Eeuo pipefail

src="${1:-}"
if [[ -z "$src" ]]; then
  echo "Usage: $0 <path-to-env-file>" >&2
  exit 2
fi

if [[ ! -f "$src" ]]; then
  echo "Source env file not found: $src" >&2
  exit 1
fi

backup_dir="${RAIZ_ENV_BACKUP_DIR:-$HOME/.config/raizdirecta/env-backups}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

base="$(basename "$src")"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
dest="$backup_dir/${base}.${ts}.bak"

umask 077
cp -p "$src" "$dest"
echo "Backed up $src -> $dest"

keep=14
mapfile -t old < <(ls -1t "$backup_dir/${base}."*.bak 2>/dev/null | tail -n +$((keep + 1)) || true)
if (( ${#old[@]} > 0 )); then
  echo "Pruning $((${#old[@]})) old backup(s) (retention=$keep):"
  for f in "${old[@]}"; do
    echo "  - $(basename "$f")"
    rm -f "$f"
  done
fi

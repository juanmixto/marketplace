#!/usr/bin/env bash
# Install raizdirecta.es host-cron units onto the whisper Proxmox node.
#
# Idempotent: safe to re-run after editing the units. Does NOT create
# /etc/raizdirecta/host-cron.env — that file holds CRON_SECRET and any
# Healthchecks ping URLs and must be provisioned by hand (mode 600).
#
# Usage:
#   sudo bash infra/systemd/install-host-crons.sh
#
# After install, verify:
#   systemctl list-timers --all | grep raizdirecta
#   sudo systemctl start raizdirecta-cleanup-idempotency.service && \
#     sudo journalctl -u raizdirecta-cleanup-idempotency.service -n 20 --no-pager

set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo bash $0)." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
src_dir="$repo_root/infra/systemd"
dst_dir="/etc/systemd/system"
env_file="/etc/raizdirecta/host-cron.env"

units=(
  raizdirecta-cleanup-idempotency.service
  raizdirecta-cleanup-idempotency.timer
  raizdirecta-host-cron-failed@.service
  raizdirecta-restore-drill.service
  raizdirecta-restore-drill.timer
  raizdirecta-git-hygiene.service
  raizdirecta-git-hygiene.timer
)

echo "Installing host-cron units to $dst_dir..."
for u in "${units[@]}"; do
  install -m 644 -o root -g root "$src_dir/$u" "$dst_dir/$u"
  echo "  installed $u"
done

if [[ ! -f "$env_file" ]]; then
  echo ""
  echo "WARNING: $env_file is missing." >&2
  echo "Create it with mode 600 BEFORE enabling the timer:" >&2
  cat <<'TEMPLATE'

  install -d -m 700 /etc/raizdirecta
  install -m 600 -o root -g root /dev/null /etc/raizdirecta/host-cron.env
  cat > /etc/raizdirecta/host-cron.env <<EOF
  CRON_SECRET=<same value as marketplaceprod app container>
  # Optional Healthchecks.io ping URLs. Leave empty to disable pings.
  HC_PING_CLEANUP_IDEMPOTENCY=
  HC_PING_RESTORE_DRILL=
  HC_PING_FAILURE=
  # B2 + dump passphrase config consumed by scripts/db/restore-drill.sh
  # Required for the monthly restore drill — leave commented if you
  # haven't provisioned B2 yet.
  # B2_REMOTE=b2-mp
  # B2_BUCKET=mp-dumps-eu
  # B2_PREFIX=daily
  # MP_DUMP_PASSPHRASE_FILE=/etc/raizdirecta/dump-passphrase
  EOF

TEMPLATE
fi

echo ""
echo "Reloading systemd..."
systemctl daemon-reload

echo ""
echo "Enabling timers..."
systemctl enable --now raizdirecta-cleanup-idempotency.timer
# The restore drill timer enables but does NOT auto-fire on install;
# the operator runs the service once by hand the first time to verify
# the B2 + Docker plumbing before letting the cron own it.
systemctl enable raizdirecta-restore-drill.timer
# The git-hygiene timer is read-only and safe to fire on schedule from
# day one. Starting it now means the next first-Monday slot will tick.
systemctl enable --now raizdirecta-git-hygiene.timer

echo ""
systemctl list-timers raizdirecta-* --all --no-pager || true

echo ""
echo "Done. To trigger immediately for smoke test:"
echo "  sudo systemctl start raizdirecta-cleanup-idempotency.service"
echo "  sudo journalctl -u raizdirecta-cleanup-idempotency.service -n 20 --no-pager"
echo ""
echo "Restore drill (only after B2_REMOTE / B2_BUCKET / MP_DUMP_PASSPHRASE_FILE"
echo "are set in $env_file):"
echo "  sudo systemctl start raizdirecta-restore-drill.service"
echo "  sudo journalctl -u raizdirecta-restore-drill.service -n 200 --no-pager"

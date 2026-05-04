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
  HC_PING_FAILURE=
  EOF

TEMPLATE
fi

echo ""
echo "Reloading systemd..."
systemctl daemon-reload

echo ""
echo "Enabling timer..."
systemctl enable --now raizdirecta-cleanup-idempotency.timer

echo ""
systemctl list-timers raizdirecta-* --all --no-pager || true

echo ""
echo "Done. To trigger immediately for smoke test:"
echo "  sudo systemctl start raizdirecta-cleanup-idempotency.service"
echo "  sudo journalctl -u raizdirecta-cleanup-idempotency.service -n 20 --no-pager"

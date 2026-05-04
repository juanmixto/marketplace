#!/usr/bin/env bash
# scripts/finish-secrets-hardening.sh
#
# Closes the manual half of epic #1192 (secrets hardening pre-launch):
#   - #1179 — move .env files into /etc/marketplace/ at mode 600
#   - #1186 — isolate the Telethon sidecar in its own UNIX user under
#             a hardened systemd unit
#
# Idempotent: safe to re-run. Each step checks the desired end state
# before mutating, so partial completion never leaves the host in a
# half-applied state. Every action prints what it is about to do AND
# what it actually changed, so the operator can interrupt at any
# point.
#
# This script does NOT rotate any secret (#1178) — those live in
# external panels (Stripe / Cloudflare / Google / Telegram /
# my.telegram.org / Postgres) and must be done by a human with
# panel access. It also does NOT delete /home/whisper/marketplace/.env
# (#1180) — that is an operator decision because the file may carry
# placeholders the operator wants to migrate first.
#
# Usage:
#   sudo bash scripts/finish-secrets-hardening.sh                 # full run
#   sudo bash scripts/finish-secrets-hardening.sh --dry-run       # show plan, do nothing
#   sudo bash scripts/finish-secrets-hardening.sh --skip-sidecar  # only #1179
#   sudo bash scripts/finish-secrets-hardening.sh --skip-move     # only #1186
#
# Safety contract:
#   - Refuses to run if not on `whisper` (single-node prod host).
#   - Refuses to run without sudo (real or via root invocation).
#   - Always backs up to /root/secrets-hardening-backup-<UTC>/ before
#     mutating, so a rollback is "rsync back, restart services".

set -euo pipefail

# ─── CLI ───────────────────────────────────────────────────────────────
DRY_RUN=0
SKIP_MOVE=0
SKIP_SIDECAR=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)      DRY_RUN=1 ;;
    --skip-move)    SKIP_MOVE=1 ;;
    --skip-sidecar) SKIP_SIDECAR=1 ;;
    -h|--help)
      sed -n '2,30p' "$0" | sed 's/^# //; s/^#//'
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

# ─── Pre-flight ────────────────────────────────────────────────────────
HOSTNAME_NOW="$(hostname)"
if [[ "$HOSTNAME_NOW" != "whisper" ]]; then
  echo "REFUSE: this script targets the prod single-node 'whisper' (got '$HOSTNAME_NOW')." >&2
  echo "        If you really mean to run it elsewhere, edit the hostname check above." >&2
  exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "REFUSE: sudo required (run with: sudo bash $0)." >&2
  exit 1
fi

APP_USER="${SUDO_USER:-whisper}"
APP_GROUP="$(id -gn "$APP_USER")"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/root/secrets-hardening-backup-${TS}"
ETC_DIR="/etc/marketplace"
APP_ENV_SRC="/home/${APP_USER}/marketplace/.env.production"
SIDECAR_ENV_SRC="/home/${APP_USER}/marketplace/services/telegram-sidecar/.env"
SIDECAR_HOME="/var/lib/telethon"
SIDECAR_SESSIONS_SRC="/home/${APP_USER}/marketplace/services/telegram-sidecar/sessions"
SIDECAR_VENV="/home/${APP_USER}/marketplace/services/telegram-sidecar/.venv"
SIDECAR_UNIT="/etc/systemd/system/telegram-sidecar.service"

run() {
  echo "    \$ $*"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    "$@"
  fi
}

note() {
  echo "[*] $*"
}

ok() {
  echo "[ok] $*"
}

skip() {
  echo "[skip] $*"
}

# ─── Backup ────────────────────────────────────────────────────────────
note "Backup directory: $BACKUP_DIR"
if [[ "$DRY_RUN" -eq 0 ]]; then
  install -d -m 700 -o root -g root "$BACKUP_DIR"
  for f in "$APP_ENV_SRC" "$SIDECAR_ENV_SRC"; do
    if [[ -f "$f" ]]; then
      cp -a "$f" "$BACKUP_DIR/"
    fi
  done
  if [[ -f "$SIDECAR_UNIT" ]]; then
    cp -a "$SIDECAR_UNIT" "$BACKUP_DIR/"
  fi
fi
ok "Pre-mutation backup ready (delete after 7 days of stability)."

# ─── #1179 — move env files to /etc/marketplace ────────────────────────
if [[ "$SKIP_MOVE" -eq 0 ]]; then
  note "#1179 — move .env files into ${ETC_DIR}/ at mode 600"

  if [[ ! -d "$ETC_DIR" ]]; then
    run install -d -m 700 -o "$APP_USER" -g "$APP_GROUP" "$ETC_DIR"
  else
    skip "${ETC_DIR}/ already exists"
  fi

  # app.env
  if [[ -f "${ETC_DIR}/app.env" ]]; then
    skip "${ETC_DIR}/app.env already present"
  elif [[ -f "$APP_ENV_SRC" ]]; then
    run install -m 600 -o "$APP_USER" -g "$APP_GROUP" "$APP_ENV_SRC" "${ETC_DIR}/app.env"
    ok "Copied $APP_ENV_SRC → ${ETC_DIR}/app.env (mode 600)"
  else
    skip "$APP_ENV_SRC missing — nothing to move (already done?)"
  fi

  # sidecar.env
  if [[ -f "${ETC_DIR}/sidecar.env" ]]; then
    skip "${ETC_DIR}/sidecar.env already present"
  elif [[ -f "$SIDECAR_ENV_SRC" ]]; then
    # Pre-create as the sidecar user so the systemd unit (#1186) can
    # read it without granting whisper access to the secrets.
    if id -u telethon >/dev/null 2>&1; then
      run install -m 600 -o telethon -g telethon "$SIDECAR_ENV_SRC" "${ETC_DIR}/sidecar.env"
    else
      # telethon user not yet created; install as whisper for now,
      # the #1186 step will chown it. Still mode 600.
      run install -m 600 -o "$APP_USER" -g "$APP_GROUP" "$SIDECAR_ENV_SRC" "${ETC_DIR}/sidecar.env"
    fi
    ok "Copied $SIDECAR_ENV_SRC → ${ETC_DIR}/sidecar.env (mode 600)"
  else
    skip "$SIDECAR_ENV_SRC missing — nothing to move"
  fi

  # Defense-in-depth: also tighten the originals if they survived.
  for f in \
    /home/${APP_USER}/marketplace/.env \
    /home/${APP_USER}/marketplace/.env.local \
    /home/${APP_USER}/marketplace/.env.production \
    /home/${APP_USER}/marketplace/services/telegram-sidecar/.env
  do
    if [[ -f "$f" ]]; then
      cur="$(stat -c '%a' "$f")"
      if [[ "$cur" != "600" ]]; then
        run chmod 600 "$f"
      fi
    fi
  done
  ok "Originals tightened to 600 (will be deleted manually after 24h smoke — see #1180)."

  # docker-compose.prod.yml already supports `${ENV_FILE:-.env.production}`,
  # so we just need to export ENV_FILE at deploy time. Document that here
  # rather than mutate the compose file.
  cat <<NOTE

  -- Next step (manual, not done by this script): update the deploy
  -- shell to export ENV_FILE before \`docker compose up\`:
  --
  --   export ENV_FILE=${ETC_DIR}/app.env
  --   docker compose -f docker-compose.prod.yml up -d --force-recreate app
  --
  -- Or equivalently in the systemd unit / wrapper script that owns
  -- the deploy. When you confirm the app boots from the new path:
  --
  --   rm $APP_ENV_SRC
  --
  -- (and same for the sidecar env once #1186 below has switched the unit
  -- to read from ${ETC_DIR}/sidecar.env).

NOTE
else
  skip "#1179 — --skip-move requested"
fi

# ─── #1186 — telethon UNIX user + hardened systemd unit ────────────────
if [[ "$SKIP_SIDECAR" -eq 0 ]]; then
  note "#1186 — isolate Telethon sidecar in dedicated UNIX user"

  # 1) telethon system user
  if id -u telethon >/dev/null 2>&1; then
    skip "user 'telethon' already exists"
  else
    run useradd --system --shell /usr/sbin/nologin --home "$SIDECAR_HOME" telethon
    ok "Created system user 'telethon' (no shell, home=$SIDECAR_HOME)"
  fi

  # 2) telethon home + sessions
  if [[ ! -d "$SIDECAR_HOME" ]]; then
    run install -d -m 700 -o telethon -g telethon "$SIDECAR_HOME"
  else
    skip "$SIDECAR_HOME already exists"
  fi
  if [[ -d "$SIDECAR_SESSIONS_SRC" ]] && [[ ! -d "${SIDECAR_HOME}/sessions" ]]; then
    run cp -a "$SIDECAR_SESSIONS_SRC" "${SIDECAR_HOME}/sessions"
    run chown -R telethon:telethon "${SIDECAR_HOME}/sessions"
    run chmod -R go-rwx "${SIDECAR_HOME}/sessions"
    ok "Migrated $SIDECAR_SESSIONS_SRC → ${SIDECAR_HOME}/sessions"
  else
    skip "${SIDECAR_HOME}/sessions already present (or no source to migrate)"
  fi

  # 3) chown the sidecar.env to telethon now that the user exists.
  if [[ -f "${ETC_DIR}/sidecar.env" ]]; then
    cur_owner="$(stat -c '%U' "${ETC_DIR}/sidecar.env")"
    if [[ "$cur_owner" != "telethon" ]]; then
      run chown telethon:telethon "${ETC_DIR}/sidecar.env"
      ok "Chowned ${ETC_DIR}/sidecar.env → telethon:telethon"
    fi
  fi

  # 4) systemd unit — only write if missing or content drifted.
  read -r -d '' UNIT_CONTENT <<UNIT || true
[Unit]
Description=Telethon ingestion sidecar (marketplace)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=telethon
Group=telethon
WorkingDirectory=/home/${APP_USER}/marketplace/services/telegram-sidecar
EnvironmentFile=${ETC_DIR}/sidecar.env
ExecStart=${SIDECAR_VENV}/bin/python -m app
Restart=on-failure
RestartSec=5

# Defense-in-depth — see #1186.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${SIDECAR_HOME} ${ETC_DIR}/sidecar.env
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictNamespaces=true
LockPersonality=true
RestrictRealtime=true
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM

[Install]
WantedBy=multi-user.target
UNIT

  if [[ -f "$SIDECAR_UNIT" ]] && diff -q <(echo "$UNIT_CONTENT") "$SIDECAR_UNIT" >/dev/null 2>&1; then
    skip "$SIDECAR_UNIT already up to date"
  else
    if [[ "$DRY_RUN" -eq 0 ]]; then
      printf '%s\n' "$UNIT_CONTENT" > "$SIDECAR_UNIT"
      chmod 644 "$SIDECAR_UNIT"
      systemctl daemon-reload
    fi
    ok "Wrote $SIDECAR_UNIT (and reloaded systemd)"
  fi

  # 5) Enable + start (idempotent).
  if [[ "$DRY_RUN" -eq 0 ]]; then
    if systemctl is-enabled --quiet telegram-sidecar.service; then
      skip "telegram-sidecar.service already enabled"
    else
      systemctl enable telegram-sidecar.service
      ok "Enabled telegram-sidecar.service"
    fi
    if systemctl is-active --quiet telegram-sidecar.service; then
      systemctl restart telegram-sidecar.service
      ok "Restarted telegram-sidecar.service to pick up new env path"
    else
      systemctl start telegram-sidecar.service
      ok "Started telegram-sidecar.service"
    fi
  else
    note "(--dry-run) would enable + start telegram-sidecar.service"
  fi
else
  skip "#1186 — --skip-sidecar requested"
fi

# ─── Verifications ─────────────────────────────────────────────────────
note "Verification (post-execution)"

echo ""
echo "  -- env file permissions --"
find "$ETC_DIR" /home/${APP_USER}/marketplace -maxdepth 4 \
  \( -name '.env' -o -name '.env.*' -o -name 'app.env' -o -name 'sidecar.env' \) \
  -not -name '*.example' 2>/dev/null \
  -printf '    %m %u:%g %p\n' | sort -u

if [[ "$SKIP_SIDECAR" -eq 0 ]]; then
  echo ""
  echo "  -- sidecar isolation --"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    if sudo -u telethon cat "${ETC_DIR}/app.env" 2>/dev/null; then
      echo "  ❌ FAIL: telethon CAN read app.env — investigate" >&2
    else
      echo "  ✅ telethon CANNOT read ${ETC_DIR}/app.env (Permission denied)"
    fi
    echo ""
    echo "  -- service status --"
    systemctl status telegram-sidecar.service --no-pager --lines=5 || true
  else
    note "(--dry-run) would verify telethon perms + service status"
  fi
fi

echo ""
ok "Done. Backup at $BACKUP_DIR (delete after 7 days)."
echo ""
echo "Next manual steps:"
echo "  1. Update the deploy shell/wrapper: export ENV_FILE=${ETC_DIR}/app.env"
echo "  2. After 24h of clean runs, rm ${APP_ENV_SRC} and ${SIDECAR_ENV_SRC}"
echo "  3. Rotate the secrets that were ever in cleartext on disk (#1178)"
echo "  4. Update docs/state-of-the-world.md to reflect the new paths"

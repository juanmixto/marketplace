# DB backup setup — Phase 0

End-to-end procedure to bring the production primary from "managed Docker volume + no off-site backups" to "bind-mounted datadir + pgBackRest WAL archive on B2 + nightly logical dump on B2 + Healthchecks alerts on Telegram".

This runbook is the operational counterpart to the repo artifacts shipped in [PR-prep]:
- `infra/pgbackrest/pgbackrest.conf.template`
- `infra/postgres/postgresql.prod.overrides.conf`
- `scripts/db/backup-dump.sh`

It covers issues #1004 #1005 #1006 #1009. Restore (issue #1010) lives in [`db-restore.md`](./db-restore.md). The umbrella epic is #1002.

> ⚠ Production-affecting steps. Read end-to-end before touching anything. Phase 0 has one ~30s downtime window (Postgres restart for `archive_mode=on`).

---

## Prereqs (issue #1003 — done before this runbook)

- Backblaze B2 account with two buckets:
  - `mp-pgbackrest-eu` — physical backups
  - `mp-dumps-eu` — logical dumps (lifecycle: daily 7d / weekly 35d / monthly 100d)
- Application Key with read+write to both buckets.
- Bitwarden vault `marketplace-infra` with: `B2_KEY_ID`, `B2_APP_KEY`, `PGBACKREST_CIPHER_PASS`, `MP_DUMP_PASSPHRASE`, `REPLICATOR_PASSWORD`.

Verify before continuing:
```bash
rclone lsd b2-mp:                # both buckets visible
b2 ls mp-pgbackrest-eu           # auth works (or rclone equivalent)
```

---

## Step 1 — Bind-mount the datadir (#1004, ~30 min, 1 restart)

The current compose uses a Docker-managed volume (`marketplace_prod_db`). pgBackRest needs filesystem access to the datadir, so we move it to a host bind-mount.

**Snapshot first.** Proxmox snapshot of the host before touching disk.

```bash
cd /opt/marketplace
docker compose -f docker-compose.prod.yml down

# Locate the existing volume
SRC="$(docker volume inspect marketplace_marketplace_prod_db -f '{{.Mountpoint}}')"
echo "$SRC"   # expect /var/lib/docker/volumes/marketplace_marketplace_prod_db/_data

# Copy data to the new bind-mount location
sudo mkdir -p /var/lib/marketplace/pgdata
sudo rsync -aHAX --numeric-ids "$SRC"/ /var/lib/marketplace/pgdata/
sudo chown -R 70:70 /var/lib/marketplace/pgdata   # postgres uid in the alpine image
sudo chmod 700 /var/lib/marketplace/pgdata
```

> **uid sanity check.** Run `docker run --rm postgres:16-alpine id postgres`. If it prints `uid=999`, use `999:999` instead. Don't guess.

Edit `docker-compose.prod.yml` `db.volumes`:
```diff
-      - marketplace_prod_db:/var/lib/postgresql/data
+      - /var/lib/marketplace/pgdata:/var/lib/postgresql/data
```
And drop the `volumes:` block at the bottom (or leave it dangling for rollback).

```bash
docker compose -f docker-compose.prod.yml up -d db
docker exec marketplace_db pg_isready -U mp_user -d marketplace
docker exec marketplace_db psql -U mp_user -d marketplace -c \
  'SELECT COUNT(*) FROM "Order";'
```

App health: `curl -fsSL https://<app-host>/api/healthz` → 200.

> Don't delete the old volume yet. Keep it for ~24h as a rollback (`docker volume rm marketplace_marketplace_prod_db` after the next successful backup verifies).

---

## Step 2 — Install pgBackRest + drop in config (#1005, ~30 min)

On the host:
```bash
sudo apt update && sudo apt install -y pgbackrest
pgbackrest version   # expect 2.x

sudo install -d -m 750 -o root -g postgres /var/log/pgbackrest /var/spool/pgbackrest
sudo chown -R postgres:postgres /var/log/pgbackrest /var/spool/pgbackrest
```

Render the config from the template — **never commit the rendered file**.

```bash
TPL=/opt/marketplace/infra/pgbackrest/pgbackrest.conf.template
OUT=/etc/pgbackrest/pgbackrest.conf

sudo install -m 640 -o root -g postgres "$TPL" "$OUT"
sudo sed -i \
  -e "s|__B2_KEY_ID__|$(bw get password 'mp/B2_KEY_ID')|" \
  -e "s|__B2_APP_KEY__|$(bw get password 'mp/B2_APP_KEY')|" \
  -e "s|__CIPHER_PASS__|$(bw get password 'mp/PGBACKREST_CIPHER_PASS')|" \
  "$OUT"

stat -c '%a %U:%G' "$OUT"   # → 640 root:postgres
```

Sanity:
```bash
sudo -u postgres pgbackrest --stanza=marketplace check 2>&1 | tail
# expect: "stanza-create" or "missing" (we'll create it after archive_mode=on)
```

---

## Step 3 — Enable archive_mode + replication settings (#1006, ~15 min, 1 restart)

The container ships defaults for everything; we only append the lines from `infra/postgres/postgresql.prod.overrides.conf`.

```bash
PGCONF=/var/lib/marketplace/pgdata/postgresql.conf

sudo cp "$PGCONF" "$PGCONF.bak.$(date -u +%Y%m%dT%H%M%SZ)"
sudo bash -c "echo; echo '# --- marketplace overrides ---'; cat /opt/marketplace/infra/postgres/postgresql.prod.overrides.conf" \
  | sudo tee -a "$PGCONF" >/dev/null

docker compose -f /opt/marketplace/docker-compose.prod.yml restart db
docker exec marketplace_db psql -U postgres -c "
  SELECT name, setting FROM pg_settings
  WHERE name IN ('archive_mode','wal_level','archive_timeout','max_wal_senders','wal_keep_size','hot_standby');
"
```

Expected:
- `archive_mode = on`
- `wal_level = replica`
- `archive_timeout = 60`

Now create the stanza and trigger the first backup:
```bash
sudo -u postgres pgbackrest --stanza=marketplace stanza-create
sudo -u postgres pgbackrest --stanza=marketplace --type=full --log-level-console=info backup
sudo -u postgres pgbackrest --stanza=marketplace info
```

`info` should show one full backup, growing WAL archive count. If `archive-async` queue starts piling in `/var/spool/pgbackrest`, B2 is unreachable — check `pgbackrest --stanza=marketplace check`.

---

## Step 4 — Logical dump cron (#1007 #1008 #1009, ~20 min)

`scripts/db/backup-dump.sh` runs nightly. It needs an env file:

```bash
sudo install -d -m 750 -o root -g root /etc/marketplace
sudo install -m 600 -o root -g root /dev/null /etc/marketplace/backup.env
sudo install -m 600 -o root -g root /dev/null /etc/marketplace/dump-passphrase

# Populate the passphrase file (no trailing newline)
bw get password 'mp/MP_DUMP_PASSPHRASE' | sudo tee /etc/marketplace/dump-passphrase >/dev/null

# Populate env
sudo tee /etc/marketplace/backup.env >/dev/null <<EOF
DATABASE_URL=postgresql://mp_user:$(bw get password 'mp/POSTGRES_PASSWORD')@127.0.0.1:5432/marketplace
MP_DUMP_PASSPHRASE_FILE=/etc/marketplace/dump-passphrase
B2_REMOTE=b2-mp
B2_BUCKET=mp-dumps-eu
HC_PING_DUMP_URL=$(bw get password 'mp/HC_PING_DUMP_URL')
EOF
```

> `bw` is the Bitwarden CLI. Substitute `pass`, `op`, etc. as needed.

Cron (root):
```cron
15 3 * * * . /etc/marketplace/backup.env && /opt/marketplace/scripts/db/backup-dump.sh >> /var/log/marketplace/backup-dump.log 2>&1
```

Healthchecks.io (already wired to Telegram per `telegram-setup.md`):
- `mp-pgbackrest-daily` — period 1d, grace 6h
- `mp-dump-daily` — period 1d, grace 6h
- `mp-verify-weekly` — period 7d, grace 1d

Test ping:
```bash
curl -fsS "$HC_PING_DUMP_URL"        # expect Telegram notification
```

---

## Step 5 — Verify (next morning)

After ~24h:
```bash
sudo -u postgres pgbackrest --stanza=marketplace info     # one full + WAL flowing
rclone lsf b2-mp:mp-dumps-eu/daily/ | tail                # one new .dump.gpg today
```

Healthchecks dashboard: 3 green checks. Then: run the restore drill (`db-restore.md` → "Manual drill") to prove the dump is restorable. Until that passes, you do **not** have backups.

---

## Rollback

If anything in Step 1 (bind-mount) goes sideways:
```bash
docker compose -f /opt/marketplace/docker-compose.prod.yml down
# Revert the compose diff (use the pre-edit copy)
docker compose -f /opt/marketplace/docker-compose.prod.yml up -d
```
The original Docker volume is intact.

If Step 3 (postgres flags) breaks startup, restore the `postgresql.conf.bak.*` copy and `restart db`.

For pgBackRest itself, removing `archive_command` and bouncing Postgres returns the cluster to pre-pgBackRest behavior (no WAL shipping, but the cluster works).

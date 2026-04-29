---
summary: Dos procedimientos: restore desde dump lógico + PITR desde WAL archive en B2.
audience: agents,humans
read_when: necesitas restaurar la DB (test, dev, o producción)
---

# DB restore

Two procedures live here:

1. **Manual drill** — monthly safety check. Restores the latest logical dump into an ephemeral container; never touches prod. Closes issue #1010.
2. **Emergency restore** — what to run when prod is on fire. Both physical (pgBackRest, fast) and logical (pg_dump, last-resort).

> If you have never run the drill against this stanza, you do not have backups — only files in B2.

Setup runbook: [`db-backup.md`](./db-backup.md). Epic: #1002.

---

## 1. Manual drill (monthly, ~10 min)

Goal: prove that yesterday's dump is restorable end-to-end and time it.

### Pre-flight

- `rclone` configured with remote `b2-mp` (or whatever `B2_REMOTE` is set to).
- `gpg` installed.
- `docker` daemon reachable.
- The dump passphrase available locally at `~/.mp-dump-passphrase` (mode 600, no trailing newline).

### Run

```bash
export MP_DUMP_PASSPHRASE_FILE=$HOME/.mp-dump-passphrase
export B2_REMOTE=b2-mp
export B2_BUCKET=mp-dumps-eu
export EXPECTED_MIN_ORDERS=1   # raise this once we have steady traffic

/opt/marketplace/scripts/db/restore-drill.sh
```

The script:
1. Lists `b2-mp:mp-dumps-eu/daily/`, picks the lexicographically latest `*.dump.gpg`.
2. Downloads + decrypts to a tmp dir.
3. Spins `postgres:16-alpine` on `:5433`, named `mp-restore-drill`.
4. `pg_restore` into a fresh `marketplace_restore` DB.
5. Asserts `SELECT COUNT(*) FROM "Order"` returns ≥ `EXPECTED_MIN_ORDERS`.
6. Tears the container down.

### Definition of done

- Exit 0.
- Final log line: `DRILL OK — <Ns> end-to-end, <N> Order rows`.
- Elapsed time logged to `/var/log/marketplace/restore-drill.log`. Track the trend; if it grows nonlinearly with DB size, we have a problem before we have an outage.
- Post the elapsed time as a comment on the open monthly drill issue.

If the script fails at any step, **the backup chain is broken**. Open a P0 incident and fix before assuming any subsequent backup is good.

---

## 2. Emergency restore — physical (pgBackRest)

For: corruption / lost cluster / "the volume is gone". Restores from the most recent base backup + WAL up to a target time.

> RTO target: < 1 h for our DB size. RPO: ≤ 1 min (driven by `archive_timeout=60`).

### Decide the target

```bash
sudo -u postgres pgbackrest --stanza=marketplace info
# Pick: latest backup, or a specific PITR time.
```

### Restore

Ideally to a separate path first to validate, then swap in. If you must restore in place:

```bash
# 1. Stop Postgres
docker compose -f /opt/marketplace/docker-compose.prod.yml stop db

# 2. Move the broken datadir aside (DON'T delete yet)
sudo mv /var/lib/marketplace/pgdata /var/lib/marketplace/pgdata.broken.$(date -u +%s)
sudo mkdir -p /var/lib/marketplace/pgdata
sudo chown 70:70 /var/lib/marketplace/pgdata
sudo chmod 700 /var/lib/marketplace/pgdata

# 3. Restore. For PITR add: --type=time --target='2026-04-28 14:30:00+00'
sudo -u postgres pgbackrest --stanza=marketplace \
  --delta --log-level-console=info restore \
  --pg1-path=/var/lib/marketplace/pgdata

# 4. Start the cluster
docker compose -f /opt/marketplace/docker-compose.prod.yml up -d db
docker exec marketplace_db pg_isready -U mp_user -d marketplace
docker exec marketplace_db psql -U mp_user -d marketplace -c 'SELECT COUNT(*) FROM "Order";'
```

Watch `pg_stat_activity` and the Vercel logs — recovery may roll forward briefly.

Once happy: archive `pgdata.broken.*` to B2 for forensics, then delete after 7d.

---

## 3. Emergency restore — logical (last resort)

For: pgBackRest stanza itself is corrupt or unrecoverable, or you need to restore to a different major version of Postgres.

```bash
# 1. Pick the dump
rclone lsf b2-mp:mp-dumps-eu/daily/ | grep '\.dump\.gpg$' | sort | tail -n5
LATEST=marketplace-YYYYMMDDTHHMMSSZ.dump.gpg

# 2. Download + decrypt
rclone copyto b2-mp:mp-dumps-eu/daily/$LATEST /tmp/$LATEST
gpg --batch --yes --passphrase-file ~/.mp-dump-passphrase \
    --decrypt --output /tmp/dump.bin /tmp/$LATEST

# 3. Restore into a fresh DB
docker exec marketplace_db psql -U postgres -c "CREATE DATABASE marketplace_restore;"
docker cp /tmp/dump.bin marketplace_db:/tmp/dump.bin
docker exec marketplace_db pg_restore -U postgres \
  -d marketplace_restore --no-owner --no-privileges /tmp/dump.bin

# 4. Validate, then either:
#    a) point the app at marketplace_restore (DATABASE_URL change), or
#    b) swap names: ALTER DATABASE marketplace RENAME TO marketplace_broken;
#                   ALTER DATABASE marketplace_restore RENAME TO marketplace;
#       (requires no active connections to either)
```

> Logical restores reset sequences. Verify with `SELECT MAX(id) FROM "<table>"` vs `SELECT last_value FROM "<seq>"` after restore. `pg_restore` from `--format=custom` handles this automatically; double-check before declaring victory.

---

## When to declare success

Whichever path:
1. App health endpoint returns 200.
2. A read-only smoke query against `Order` returns rows.
3. A test write (e.g., create an admin-only test order in staging mode) commits and returns.
4. PostHog `checkout.*` events flow again.
5. Post-mortem entry in `docs/runbooks/payment-incidents.md` if any orders are at risk.

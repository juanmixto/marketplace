# DB data corruption

12-step checklist for "the DB is up but something is wrong with the data". Use this when:

- Constraint violations appear that should be impossible
- A query returns rows that contradict the schema (NULL where NOT NULL, FK pointing to a missing parent, etc.)
- Sentry alerts for `Prisma*Error` spike
- A user reports "my order disappeared" / "my balance is wrong"
- `pg_dump` or `pg_basebackup` fails with checksum errors
- `pgbackrest --stanza=marketplace check` warns about page checksum mismatches

For "DB process down / host gone" → [`db-failover.md`](./db-failover.md). For "verified backup → fresh DB" → [`db-restore.md`](./db-restore.md).

Epic: #1002.

---

## Triage thresholds

| Severity | Symptoms | Action |
|---|---|---|
| **P0** | Multiple tables affected, payments at risk, checkout broken | Stop the bleed (step 2), restore PITR (step 8b) |
| **P1** | One table affected, app-level workaround exists | Quarantine (step 4), targeted fix (step 9) |
| **P2** | Detected by drill / cron only, no user impact yet | Investigate (steps 5-7), schedule fix |

---

## The 12 steps

### 1. Acknowledge — don't make it worse

- **Do NOT** run `VACUUM FULL`, `REINDEX`, `pg_resetwal`, `pg_repair_bad`, or anything that mutates state until you have evidence.
- **Do NOT** restart Postgres "to see if it goes away". A clean shutdown of a corrupt cluster can lose more data.
- Open the runbook timer. Note the wall-clock at every step — incident postmortem will need it.

### 2. Stop the bleed

If the corruption is causing checkout to fail or wrong charges to land, kill the corrupted code path immediately:

```bash
# Disable checkout via PostHog kill switch (already wired)
# kill-checkout = true → checkout returns 503 with maintenance copy
```

See `docs/conventions.md` § Feature flags for the exact flag list. Better to be down than to confirm bad orders.

### 3. Snapshot the current state

Before any investigation that might change anything:

```bash
# Proxmox VM snapshot, name "corruption-pre-investigation-YYYYMMDD-HHMM"
# This freezes the broken state for forensics.

# Plus: dump the affected tables to a side file (READ-ONLY)
docker exec marketplace_db pg_dump -U postgres -d marketplace \
  -t '"Order"' -t '"Payment"' -F c \
  > /tmp/corrupt-$(date -u +%s).dump
```

### 4. Quarantine

Decide: can the rest of the marketplace keep working?

- If only one table is corrupt and it's not on the checkout path → continue running, mark that surface read-only at app layer.
- If it's on the checkout path → maintenance mode (see step 2).
- Document the choice. "We kept the site up because X" must be in the postmortem.

### 5. Identify the scope

```sql
-- Cluster-wide checksum scan (slow, run during low traffic)
SELECT datname FROM pg_database WHERE datallowconn;
\c marketplace
-- Run a SELECT * on each table in batches; corrupt blocks throw clearly
-- Or use pg_amcheck (PG14+):
\! pg_amcheck --all-databases --progress
```

Also:

```bash
sudo -u postgres pgbackrest --stanza=marketplace check
sudo -u postgres pgbackrest --stanza=marketplace --log-level-console=detail \
  --type=full --dry-run backup     # surfaces datadir-level issues
```

Output of `pg_amcheck` plus `pgbackrest check` is your list of affected relations.

### 6. Identify the cause

Most likely (in order):

1. **Disk / hardware** — `dmesg | grep -iE 'I/O error|sata|nvme|smart'`, `smartctl -a /dev/<disk>`. If yes, the host is dying — go straight to step 8b (PITR onto a different host).
2. **Postgres bug after upgrade** — recently bumped major version? Check release notes.
3. **App-level bad write** — `git log --since="<incident time>" -- prisma/schema.prisma src/domains/`. A migration that backfilled wrong values is "corruption" too, just a logical one.
4. **External writer** — anything with direct DB access bypassing Prisma? (Should be nothing in this codebase.)

### 7. Decide: localized fix vs PITR

Choose path **9 (localized)** if all of:
- Single table, < 1k affected rows
- Constraint or FK violation, not page-level corruption
- App can re-derive or accept the loss
- No payments / orders touched

Choose path **8 (PITR)** if any of:
- Page checksum errors → physical corruption
- More than one table affected
- Payments / orders involved (auditable trail required)
- Cause is uncertain

### 8. Path: Point-in-time recovery

#### 8a. Find the last known good time

```sql
-- Most recent transaction that looks healthy
SELECT MAX("createdAt") FROM "Order" WHERE "status" = 'PAID';
-- Cross-check against Stripe dashboard for last clean charge
```

Pick a target slightly before the first detected corruption. Round down to the nearest minute (`archive_timeout=60`).

#### 8b. Restore to a side cluster, validate, then swap

> Do NOT restore over the live cluster directly. Use a side cluster on the same host (different port) so you can compare.

Follow [`db-restore.md`](./db-restore.md) §2 with `--type=time --target='YYYY-MM-DD HH:MM:SS+00'` and `--pg1-path=/var/lib/marketplace/pgdata-restored`. Boot it on `:5433`, validate, then:

```bash
# Final swap (during maintenance window)
docker compose -f docker-compose.prod.yml stop db
sudo mv /var/lib/marketplace/pgdata          /var/lib/marketplace/pgdata.broken.$(date -u +%s)
sudo mv /var/lib/marketplace/pgdata-restored /var/lib/marketplace/pgdata
docker compose -f docker-compose.prod.yml up -d db
```

### 9. Path: Localized fix

Document the SQL in a migration named `<timestamp>_incident_<short-desc>.sql` and apply via the normal Prisma migration flow even if the fix is "just a DELETE" — leave a paper trail.

```sql
BEGIN;

-- Always SELECT the rows you're about to touch first
SELECT * FROM "<table>" WHERE <predicate>;

-- Then mutate
UPDATE "<table>" SET ... WHERE <predicate>;
-- or
DELETE FROM "<table>" WHERE <predicate>;

-- Verify constraints still hold
SELECT COUNT(*) FROM "<table>" WHERE ...;

COMMIT;     -- only after explicit "ok" from a second engineer
```

Two-person rule for production-touching SQL during an incident. No exceptions.

### 10. Reconcile downstream

If `Order` / `Payment` were touched, replay state machines:

- `OrderEvent` audit trail — append a `corruption_repair` event for each affected order. (See `docs/orderevent-vs-webhookdelivery.md`.)
- Stripe webhook deliveries that landed during the broken window — check `WebhookDelivery` for failed/retried entries; replay if needed (`scripts/sendcloud-replay.ts` is the pattern).
- Payment reconciliation — run `scripts/reconcile-payments.ts` against the affected window.

### 11. Re-open the marketplace

Same checklist as `db-failover.md` step 4 (Validate before re-opening). Don't skip the synthetic checkout.

### 12. Postmortem (within 48 h)

- Timeline (use the wall-clock notes from step 1).
- Root cause + contributing factors.
- Detection delay — when did the corruption start vs when did we notice?
- Was the kill switch in step 2 effective? If not, why?
- Followups:
  - Does pg_amcheck need to be a cron? (It's cheap; we can land it.)
  - Should the affected schema have a CHECK constraint that would have caught this earlier?
  - Was the PITR target obvious or did we have to guess?
- Append entry to [`docs/runbooks/payment-incidents.md`](./payment-incidents.md) if any orders were at risk.

---

## Things that look like corruption but aren't

- **Replication lag on a future standby** (Phase 1+) — the standby is *behind*, not corrupt. Use `pg_stat_replication.lag`.
- **Stale Prisma client** in the app — the cluster is fine; redeploy.
- **Migration drift in dev** — `marketplace_test` vs `marketplace` confusion (see `feedback_db_url_split` in CLAUDE memory). Fix the env, not the data.
- **Missing rows after a re-import** — that's truncation, not corruption. Different runbook.

If unsure, demote one severity (P0 → P1, P1 → P2) and investigate further before mutating anything.

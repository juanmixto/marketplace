# DB failover

**Phase 0 placeholder.** Phase 0 has **no hot standby** — there is one Postgres primary on Proxmox and nightly logical dump + WAL archive on Backblaze B2. There is nothing to "fail over to": recovery means *restore*, not *promote*.

This file exists so oncall can find it during an incident and not invent something on the fly. It will be rewritten in Phase 1 (issue #1016) once issue #1014 lands the async standby.

For the actual recovery procedures, jump to [`db-restore.md`](./db-restore.md).

Epic: #1002.

---

## When to use this runbook

The primary is dead or unreachable and you need the marketplace back online. Examples:

- Disk failure / corrupt filesystem on the Proxmox host
- VM gone (deleted, accidentally rebuilt, hypervisor lost)
- DB process refuses to start after a crash and `pg_resetwal` is not safe
- Ransomware / data destroyed by mistake

If the DB is running but slow / partly broken (e.g. one corrupt index, one bad table), use [`db-data-corruption.md`](./db-data-corruption.md) instead — restoring the whole cluster for a localized issue is overkill.

---

## Phase 0 reality check

| | Phase 0 (today) | Phase 1 (#1014+) |
|---|---|---|
| Topology | 1 primary, no standby | 1 primary + 1 async standby |
| RPO target | ≤ 1 min (driven by `archive_timeout=60`) | ≤ 5 s |
| RTO target | < 1 h | < 5 min |
| Recovery action | **Restore from B2** | **Promote standby** |
| Data loss window | Whatever WAL has been shipped to B2 since last segment | Replication lag at moment of failure |

Phase 0 RTO depends almost entirely on download speed from B2 + WAL replay. Track the elapsed time of the monthly drill (`docs/runbooks/db-restore.md` §1) — that is your honest RTO baseline.

---

## Decision flow

```
Primary down?
│
├─ Yes, hardware/host is gone
│   → Provision a fresh Postgres host (Proxmox VM, same base image)
│   → docs/runbooks/db-restore.md §2 "Emergency restore — physical (pgBackRest)"
│   → Repoint Cloudflared / DATABASE_URL → new host
│
├─ Yes, host is up but DB process won't start cleanly
│   → Try: docker logs marketplace_db --tail=200
│   → If WAL is corrupt: db-restore.md §2 (PITR to last good time)
│   → If only one DB / table is corrupt: db-data-corruption.md
│
└─ No, DB is up but app errors
    → Not a failover scenario. Check: app logs, network, Stripe webhooks,
      Sentry. Do NOT restore.
```

---

## During the incident

### 1. Stop the bleed
Put the marketplace into a clean degraded state, not a flapping one:

```bash
# Cloudflare WAF: enable "Under Attack" mode if traffic is the cause.
# (See docs/runbooks/under-attack.md.)

# Otherwise: route the public origin to a static maintenance page.
# Cloudflared/Vercel: switch DATABASE_URL to a sentinel that 503s the app.
```

This is more honest than serving stale 500s with no checkout.

### 2. Communicate

- Post in the ops Telegram: "DB primary down — restoring. ETA ~30-60 min."
- Update the same channel every 15 min until back.
- Stripe webhook deliveries that fail will retry with exponential backoff (see [`docs/runbooks/payment-incidents.md`](./payment-incidents.md)). Don't disable webhook ingestion unless explicitly necessary.

### 3. Restore
Follow [`db-restore.md`](./db-restore.md) §2 (physical, fast) or §3 (logical, last resort).

### 4. Validate before re-opening
Minimum checks before re-pointing the public origin:

- [ ] `SELECT COUNT(*) FROM "Order"` returns the expected ballpark
- [ ] `SELECT MAX("createdAt") FROM "Order"` ≤ a couple of minutes before failure (this is your real RPO)
- [ ] App `/api/healthz` → 200 against the new DB
- [ ] One synthetic checkout (test mode) end-to-end
- [ ] PostHog `checkout.*` events flowing
- [ ] Stripe webhook endpoint reachable; replay any deliveries marked failed in `WebhookDelivery`

### 5. Post-incident (within 24 h)

- Append entry to `docs/runbooks/payment-incidents.md` if any orders were at risk.
- Open an issue tagged `incident-postmortem` capturing: timeline, RPO actually achieved, RTO actually achieved, what would have made this faster.
- If RTO > target (1 h): file a Phase 1 prioritization issue. Phase 0 was meant to get you to "no permanent loss"; if you are routinely exceeding 1 h to recover, Phase 1 (standby) needs to land.

---

## What this file does NOT cover yet

- **Promote standby** — N/A in Phase 0. Phase 1 will add it (issue #1016).
- **Read traffic split** — N/A (no replica to read from).
- **Sync replication** — Phase 2 (issue #1021).

If an oncall is reading this expecting one of those, escalate to the user — Phase 1 has not landed yet.

# Telegram ingestion — architecture & runbook

> Canonical reference for the Telegram ingestion subsystem. Read before touching
> `src/domains/ingestion/`, `src/workers/`, `src/lib/queue.ts`, or the Telethon
> sidecar. Phase 1 landed in #658.

Last verified against `main`: 2026-04-20.

## Overview

The ingestion subsystem pulls messages from public Telegram groups into
structured marketplace data (products, vendors, media). Phase 1 ships the
**raw pipeline only** — messages land in dedicated tables for human review
later; **no product or vendor data is created in Phase 1**.

### Non-goals (Phase 1)

- No AI/LLM extraction.
- No writes to `Product`, `Vendor`, `ProductImage`.
- No public-facing UI.
- No auto-publishing at any phase before human review.

## Architecture

```mermaid
flowchart LR
  subgraph tg["Telegram (MTProto)"]
    tgchats[Public chats]
  end

  subgraph sidecar["Telethon sidecar (private network only)"]
    telethon[Telethon session]
    api[HTTP API + shared secret]
    telethon <--> api
  end

  subgraph db["Postgres"]
    raw[TelegramIngestion* tables]
    pgboss[(pg-boss queue)]
  end

  subgraph worker["Worker process (npm run worker)"]
    sync[telegram.sync job]
    media[telegram.mediaDownload job]
  end

  subgraph web["Next.js web app"]
    admin[/admin/ingestion UI — flag-gated]
    actions[admin server actions]
  end

  tgchats --> telethon
  api --> worker
  worker --> raw
  worker <--> pgboss
  actions -->|enqueue| pgboss
  admin -->|read-only| raw
```

Hard isolation rules:

1. The **Telethon sidecar** listens only on a private network / loopback and
   requires `X-Sidecar-Token`. It is never reachable from the browser or any
   public origin.
2. The **worker** is a separate Node process (`npm run worker`). Web dynos
   never run pg-boss handlers, so ingestion load cannot steal Next.js CPU.
3. The **web app** only enqueues jobs and reads raw tables. It never opens a
   socket to Telegram.

## Data flow

`Telegram → Telethon sidecar → worker (sync job) → raw tables → (future) classify → (future) draft → (future) admin review → (future) publish`

Phase 1 covers the left half up to "raw tables". Everything right of that is
placeholder.

## Components

- [`src/domains/ingestion/`](../../src/domains/ingestion/) — domain barrel,
  types, flag helpers, admin authz guard, Telegram provider layer.
- [`src/domains/ingestion/telegram/providers/`](../../src/domains/ingestion/telegram/providers/)
  — provider contract (`TelegramIngestionProvider`), `createMockProvider`,
  `createTelethonHttpProvider`, typed error classes, env-selected factory
  `getTelegramProvider`.
- [`src/lib/queue.ts`](../../src/lib/queue.ts) — pg-boss wrapper
  (`getQueue`, `enqueue`, `registerHandler`, `stopQueue`).
- [`src/workers/index.ts`](../../src/workers/index.ts) — worker entrypoint.
- [`services/telegram-sidecar/`](../../services/telegram-sidecar/) —
  Python + Telethon sidecar (FastAPI). Phase 1 PR-B ships the contract
  surface; auth + read endpoints return `501` until PR-C.
- [`src/domains/ingestion/telegram/jobs/`](../../src/domains/ingestion/telegram/jobs/)
  — pure job handlers (`telegramSyncHandler`, `telegramMediaDownloadHandler`)
  with dependency-injected `db` / provider / store / clock. Tests drive
  the pure form; production wraps them in
  [`src/workers/jobs/`](../../src/workers/jobs/).
- `prisma/schema.prisma` — the `TelegramIngestion*` models + `IngestionJob`.

### Job handlers (PR-C)

| Job | Singleton key | Retry | Concurrency (default) |
|---|---|---|---|
| `telegram.sync` | per chat | exponential ×5 | 1 |
| `telegram.mediaDownload` | `media:<fileUniqueId>` | exponential ×5 | 1 |

**Sync handler invariants** (pinned in tests):

- Kill switch is the first operation — zero I/O when engaged.
- Disabled chat / inactive connection → skip without opening a run.
- Message upserts + cursor advance run in **one transaction**;
  mid-batch failure → rollback → next attempt re-reads → `@@unique`
  dedupes. No gaps, no duplicates.
- `TelegramChatGoneError` → disables the chat (terminal state).
- Other provider errors rethrow so pg-boss applies retry policy.
- Media downloads are enqueued **after** the commit, deduped by
  `fileUniqueId` within the batch. Enqueue failure leaves the media
  row `PENDING` for the Phase 6 sweeper.

**Media handler invariants** (pinned in tests):

- Kill switch first. Then dedupe on `blobKey`.
- Hard size cap enforced both as pre-check and mid-stream.
- `SOURCE_GONE` terminal; `AUTH_REQUIRED` rethrows for alert; retryable
  errors leave row `PENDING` and rethrow.

**Magic-byte validation — explicitly NOT done.** The MIME type comes from
the Telethon sidecar's `fetchMedia()` and the worker stores it without
re-checking the byte stream against a magic-byte signature. This is a
deliberate trade-off: the source is the official Telegram API via a
provider we control, not user uploads, so the threat model that justifies
the magic-byte gate on `/api/upload` does not apply.

**If this pipeline is ever reused for user-supplied input** (e.g. a
"submit your own product photo via Telegram bot" feature), the worker
MUST add a magic-byte check (`detectFileTypeFromMagicBytes` from
`src/lib/upload-validation.ts`) before persisting `mimeType` or
serving the blob. See HU8 in epic #1160.

**Runtime tunables** (env, conservative defaults):

| Env var | Default | Max | Purpose |
|---|---|---|---|
| `INGESTION_TELEGRAM_BATCH_SIZE` | 100 | 500 | Messages per sync batch |
| `INGESTION_TELEGRAM_SYNC_CONCURRENCY` | 1 | 4 | Parallel sync workers |
| `INGESTION_TELEGRAM_MEDIA_CONCURRENCY` | 1 | 4 | Parallel media workers |
| `INGESTION_TELEGRAM_MEDIA_MAX_BYTES` | 20 MB | 256 MB | Hard cap per file |

### Provider contract

The worker never talks to Telegram directly. It obtains a
`TelegramIngestionProvider` via `getTelegramProvider()` and uses the
contract:

```ts
fetchChats(input): Promise<{ chats: RawTelegramChat[] }>
fetchMessages(input): Promise<{ messages: RawTelegramMessage[]; nextFromMessageId: string | null }>
fetchMedia(input): Promise<{ stream: AsyncIterable<Uint8Array>; mimeType; sizeBytes }>
```

Selection is env-driven via `INGESTION_TELEGRAM_PROVIDER`:

| Value | Implementation | Default? |
|---|---|---|
| `mock` (or unset) | in-memory fixtures | yes |
| `telethon` | HTTP bridge to the sidecar (requires `TELEGRAM_SIDECAR_URL` + `TELEGRAM_SIDECAR_TOKEN`) | no |

Errors bubble as a closed taxonomy so the worker can dispatch without
string matching: `TelegramTransportError` (retryable),
`TelegramFloodWaitError` (reschedule with `retryAfterSeconds`),
`TelegramAuthRequiredError` (disable connection, alert),
`TelegramChatGoneError` (disable chat), `TelegramBadResponseError`
(fail loud — indicates SDK/sidecar drift).

## Feature flags

| Flag | Default (PostHog) | Meaning when `true` |
|---|---|---|
| `kill-ingestion-telegram` | `true` (killed) | Subsystem is KILLED. Jobs short-circuit before touching Telegram or DB. |
| `feat-ingestion-admin`    | `false`         | Admin UI visible and mutation actions accepted for this user. |

Fail-open semantics from [`src/lib/flags.ts`](../../src/lib/flags.ts) apply: a
PostHog outage resolves both flags to `true`. For the kill flag that means
ingestion stays off during an outage — the conservative default.

Wrappers in [`src/domains/ingestion/flags.ts`](../../src/domains/ingestion/flags.ts)
emit `ingestion.telegram.kill_switch_active` whenever the kill reading fires,
so oncall can trace blocked traffic by correlation id.

### Rollback drill

Flip `kill-ingestion-telegram` to `true` in PostHog. Expected behaviour:

- New sync jobs exit cleanly on first kill-switch check; no Telegram I/O, no
  cursor advance.
- In-flight jobs finish their current batch (upserts are idempotent). The
  cursor only advances after a fully successful batch, so no messages are
  lost and none are duplicated on resume.

Incident override (PostHog itself down):
`FEATURE_FLAGS_OVERRIDE='{"kill-ingestion-telegram":true}'`.

### How to verify zero runtime impact (Phase 1 acceptance)

Phase 1 ships inert code. Any doubt about that can be confirmed mechanically,
without deploying anything:

1. **Web graph isolation** — `src/workers/` and `src/lib/queue.ts` are not
   imported by any file under `src/app/`, `src/components/`, or any domain
   other than `ingestion`. Verify:
   ```bash
   grep -rE "from ['\"]@/workers|from ['\"]@/lib/queue['\"]" src/app src/components src/domains \
     | grep -v src/workers
   # expected: no output
   ```
2. **Lazy queue init** — `src/lib/queue.ts` declares `let instance = null`
   and `let startPromise = null` at module level. `new PgBoss(...)` is only
   constructed inside `createInstance()`, which only runs when `getQueue()`
   is called. Importing the module does not open a DB connection.
3. **Migration additivity** — the migration contains only `CREATE TABLE`,
   `CREATE TYPE`, `CREATE INDEX`, and `ALTER TABLE ... ADD CONSTRAINT`
   statements, all scoped to the new `TelegramIngestion*` / `IngestionJob`
   tables. No pre-existing table is touched.
4. **Kill switch default** — `isIngestionKilled()` resolves to `true` when
   no `FEATURE_FLAGS_OVERRIDE` is set and PostHog is unavailable, because
   `src/lib/flags.ts` is fail-open and the flag meaning inverts for
   `kill-*` (`true` = killed). Pinned by
   `test/features/ingestion-flags.test.ts`.
5. **Handler kill-switch invariant** — `src/workers/index.ts` registers
   two handlers (`telegram.sync`, `telegram.mediaDownload`). The very
   first operation in each handler is a `kill-ingestion-telegram`
   probe; if engaged, the handler returns `KILLED` before any provider
   I/O, DB create, or enqueue. The default provider is `mock`, so even
   an accidental deploy with the kill switch disabled returns no data.
   Pinned by `test/features/ingestion-sync-handler.test.ts` and
   `test/features/ingestion-media-handler.test.ts`.

### Rollout plan

The minimum path from "all dark" to "Phase 1 GA". Every step is a PostHog
flag flip or env change — no code deploy in between.

1. **Dev only.** `feat-ingestion-admin` ON for `juan.ortega.saceda@gmail.com`.
   `kill-ingestion-telegram` stays ON (killed). `INGESTION_TELEGRAM_PROVIDER=mock`.
   Verification: admin can open (future) `/admin/ingestion` and see empty
   tables. Nothing else runs. Expected traffic to the sidecar: zero.
2. **Internal admin canary.** `feat-ingestion-admin` ON for `ADMIN_*` roles.
   Sidecar connected to a single throwaway test chat on a staging Telethon
   session. `INGESTION_TELEGRAM_PROVIDER=telethon`. Kill switch still ON.
   Verification: admin UI paths traverse cleanly; sidecar returns `501` on
   every read attempt because handlers are blocked by kill.
3. **Live read-only — single chat.** Flip `kill-ingestion-telegram` to OFF
   for a single vendor test chat. Watch sync runs for 48 h:
   - `SELECT COUNT(*) FROM "TelegramIngestionMessage"` grows.
   - `TelegramIngestionSyncRun.status = 'OK'` > 95 % of runs.
   - Sidecar error rate in logs `ingestion.telegram.http.failed` ≈ 0.
   - Web app P95 API latency unchanged (compare against the previous 48 h).
4. **Phase 1 GA.** Keep `feat-ingestion-admin` ON for admins only; Phase 1
   is invisible to non-admins by design. Enable additional chats one at a
   time, observing the above metrics between flips.

**Rollback drill** (validated during step 3):
Flip `kill-ingestion-telegram` back to ON → all sync/media jobs short-circuit
on first probe → zero DB writes, zero sidecar calls. Cursor is not advanced
mid-batch, so resume on re-enable is lossless and duplicate-free.

**Incident override** (PostHog itself is down):
`FEATURE_FLAGS_OVERRIDE='{"kill-ingestion-telegram":true}'` → redeploy →
fail-open resolves to "killed" by contract; worker idles until PostHog
recovers or override is removed.

**Cleanup ticket** (#666 sub-task): file one issue labeled
`tech-debt,ingestion` titled *"Remove `feat-ingestion-admin` gate 30 days
post Phase 4 GA"*. The gate is only a WIP surface; once admin review is
stable in Phase 4, the flag is debt.

## Retention & storage

Policy is conservative: **raw messages and successfully downloaded media
are never auto-deleted** — they are the source of truth for every
downstream phase. The sweeper only trims operational artefacts.

| Table / row class | Retention | Swept by |
|---|---|---|
| `TelegramIngestionConnection`, `TelegramIngestionChat` | forever (manual disable / delete only) | — |
| `TelegramIngestionMessage` | **forever** (source of truth) | — |
| `TelegramIngestionMessageMedia` (status `DOWNLOADED`) | forever | — |
| `TelegramIngestionMessageMedia` (status `FAILED`) | forever (operator diagnostics) | — |
| `TelegramIngestionMessageMedia` (status `SOURCE_GONE` / `SKIPPED_OVERSIZE`) | `INGESTION_FAILED_MEDIA_RETENTION_DAYS` (default 90) | sweeper |
| `TelegramIngestionSyncRun` | `INGESTION_SYNC_RUN_RETENTION_DAYS` (default 90) | sweeper |
| `IngestionJob` (terminal: OK / FAILED / DEAD) | `INGESTION_JOB_RETENTION_DAYS` (default 30) | sweeper |
| `IngestionJob` (QUEUED / RUNNING) | **never** | sweeper will not touch |

Env tunables (all clamped to 5 years max):

- `INGESTION_SYNC_RUN_RETENTION_DAYS` — default 90.
- `INGESTION_JOB_RETENTION_DAYS` — default 30.
- `INGESTION_FAILED_MEDIA_RETENTION_DAYS` — default 90.
- `INGESTION_SWEEP_BATCH_SIZE` — default 500 (max 5 000).
- `INGESTION_SWEEP_MAX_DURATION_MS` — default 5 min (max 30 min).

### Sweeper safety model

Implemented by `runRetentionSweep` in
[`src/domains/ingestion/retention/sweeper.ts`](../../src/domains/ingestion/retention/sweeper.ts).
Pinned invariants (see
[`test/features/ingestion-retention-sweeper.test.ts`](../../test/features/ingestion-retention-sweeper.test.ts)
and
[`test/integration/ingestion-sweeper.test.ts`](../../test/integration/ingestion-sweeper.test.ts)):

- **Batch-based.** Each delete is bounded by `sweepBatchSize`; the longest
  lock we ever hold is the time to delete that many rows.
- **Idempotent.** Running twice is equivalent to running once. No row is
  double-counted in the returned `deleted*` fields across invocations.
- **Wall-clock cap.** If `sweepMaxDurationMs` elapses, the sweeper exits
  with `stoppedReason: 'deadline'`. A later invocation picks up where it
  left off.
- **Cancelable.** An `AbortSignal` halts the loop between batches.
- **Never touches source-of-truth.** The `findMany` filters hard-coded in
  the sweeper exclude `TelegramIngestionMessage`, DOWNLOADED media, and
  non-terminal `IngestionJob` rows.

### Running the sweeper

- **Manual**: `npm run ingestion:sweep` — safe at any time; idempotent.
- **Scheduled**: run via an external cron (systemd timer, k8s CronJob,
  Vercel Cron) nightly. Phase 6 can wire it to pg-boss's built-in
  `boss.schedule()` if volume grows.
- **Incident**: if a policy change demands an immediate catch-up, run the
  CLI by hand; the batch cap prevents DB stalls.

## Authz boundary

Every ingestion server action MUST go through `requireIngestionAdmin()`
([`src/domains/ingestion/authz.ts`](../../src/domains/ingestion/authz.ts)).
Bare `requireAdmin()` is not enough — the flag check lives inside
`requireIngestionAdmin`.

## Runbook

Short playbook. Longer-form investigations follow the same patterns as
[`docs/runbooks/payment-incidents.md`](./runbooks/payment-incidents.md) —
grep by scope, thread by correlation id.

### 1. Verify the kill switch is working

1. Flip `kill-ingestion-telegram` to ON in PostHog (the "killed" state).
2. Enqueue a sync job manually (future admin action; meanwhile via `psql`
   or pg-boss CLI on staging).
3. Grep logs for `ingestion.telegram.kill_switch_active` — one line per
   blocked job. `ingestion.telegram.sync.started` MUST NOT appear.
4. Confirm `TelegramIngestionSyncRun` count did NOT grow.

If any of those fail, stop the worker immediately (next section) and
escalate — a kill switch that does not kill is the worst state in this
subsystem.

### 2. Stop worker and sidecar fast

- **Worker**: `kill -TERM <pid>` → pg-boss drains in-flight jobs (≤30 s)
  then exits. Kubernetes: scale the deployment to 0. Docker: `docker stop`.
- **Sidecar**: stop the container. Telethon session files are persistent;
  a restart resumes where it left off.
- **Queue drain** (optional, not required for shutdown): `UPDATE pgboss.job
  SET state='cancelled' WHERE name LIKE 'telegram.%' AND state='created'`.

### 3. Diagnose a backlog

```sql
SELECT name, state, COUNT(*) FROM pgboss.job
 WHERE name LIKE 'telegram.%'
 GROUP BY name, state
 ORDER BY name, state;
```

Look for `state='created'` rows older than a few minutes. Cross-check with
worker logs: a quiet worker and a growing backlog means the worker is
dead or unhealthy.

### 4. Retry failed jobs

pg-boss keeps failed jobs in `pgboss.job` with `state='failed'`. Requeue
one by inserting a fresh row with the same `name` and `data`, or via an
admin action (Phase 4). For a systematic replay after a sidecar outage:

```sql
INSERT INTO pgboss.job (id, name, data, state)
SELECT gen_random_uuid(), name, data, 'created'
  FROM pgboss.job
 WHERE name = 'telegram.sync' AND state = 'failed'
   AND "createdOn" > now() - interval '1 hour';
```

### 5. Handle typed errors

| Log scope | Error class | Action |
|---|---|---|
| `ingestion.telegram.sync.chat_gone_disabled` | `TelegramChatGoneError` | Chat was auto-disabled. Investigate in Telegram (kicked? deleted?). Re-enable manually only after confirming the chat is back. |
| `ingestion.telegram.media.auth_required` | `TelegramAuthRequiredError` | Telethon session expired. Re-auth via the admin flow (Phase 4) or, as a stopgap, log into the sidecar pod and re-run the `auth/start` + `auth/verify` sequence. |
| Any scope with `FloodWait` in the error | `TelegramFloodWaitError` | Telegram rate-limited us. pg-boss has already rescheduled with backoff. If it recurs, lower `INGESTION_TELEGRAM_SYNC_CONCURRENCY`. |
| `ingestion.telegram.http.failed` | `TelegramTransportError` | Sidecar unreachable. Verify the sidecar container, its shared secret, and the `TELEGRAM_SIDECAR_URL`. Retries are automatic. |
| `ingestion.telegram.http.retry` repeating | — | Persistent transport failures. Circuit-break the provider: set `INGESTION_TELEGRAM_PROVIDER=mock` to freeze the subsystem while debugging. |

### 6. Confirm no impact on the web app

- Compare web API P95 before/after the ingestion push: `web.request.*`
  scope in your log aggregator.
- Confirm `src/workers/*` and `src/lib/queue.ts` remain unimported from
  `src/app/`:

  ```bash
  grep -rE "from ['\"]@/workers|from ['\"]@/lib/queue['\"]" src/app src/components src/domains \
    | grep -v src/workers
  # expected: no output
  ```
- Confirm the worker's Postgres connection count is bounded (pg-boss
  opens its own pool; don't reuse the Next.js one).

### 7. End-to-end "is ingestion healthy?" recipe

```sql
-- Sync throughput over the last hour
SELECT status, COUNT(*), MAX("finishedAt") AS last
  FROM "TelegramIngestionSyncRun"
 WHERE "startedAt" > now() - interval '1 hour'
 GROUP BY status;

-- Any chats stuck on old cursors?
SELECT id, title, "lastMessageId", "updatedAt"
  FROM "TelegramIngestionChat"
 WHERE "isEnabled" = true
   AND "updatedAt" < now() - interval '6 hours';

-- Pending media older than 24 h?
SELECT COUNT(*) FROM "TelegramIngestionMessageMedia"
 WHERE status = 'PENDING' AND "createdAt" < now() - interval '24 hours';
```

Healthy: mostly `OK` sync runs, recent `updatedAt` on enabled chats,
zero or small pending-media backlog.

## Decisions log

- **2026-04-20 — Queue: pg-boss.** Postgres-backed queue; no Redis. Tradeoff:
  lower ceiling than BullMQ but matches the "no new infra" constraint.
  Revisit if sustained throughput exceeds ~hundreds msg/min.
- **2026-04-20 — Telegram client: Telethon in a Python sidecar.** MTProto in
  Node (gram.js) is less battle-tested. Isolating session in a sidecar also
  limits blast radius (public web never reaches Telegram).
- **2026-04-20 — No auto-publish.** Every phase before #5 keeps data in
  `TelegramIngestion*` + draft tables; only explicit admin approval moves
  data into `Product` / `Vendor`.
- **2026-04-20 — Model prefix `TelegramIngestion*`.** Avoids collision with
  pre-existing `TelegramLink*` / `TelegramActionLog` (user-notification bot,
  unrelated subsystem).

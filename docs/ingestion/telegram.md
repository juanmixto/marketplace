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
  types, flag helpers, admin authz guard.
- [`src/lib/queue.ts`](../../src/lib/queue.ts) — pg-boss wrapper
  (`getQueue`, `enqueue`, `registerHandler`, `stopQueue`).
- [`src/workers/index.ts`](../../src/workers/index.ts) — worker entrypoint.
- `services/telegram-sidecar/` — Python/Telethon sidecar. **(PR-B)**
- `prisma/schema.prisma` — the `TelegramIngestion*` models + `IngestionJob`.

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
5. **No handler registered** — `src/workers/index.ts` boots pg-boss but
   calls no `registerHandler`. If the worker were deployed today, it would
   idle. Handlers land in PR-C.

### Rollout plan

To be filled in PR-D (#666).

## Retention & storage

To be filled in PR-D (#672).

## Authz boundary

Every ingestion server action MUST go through `requireIngestionAdmin()`
([`src/domains/ingestion/authz.ts`](../../src/domains/ingestion/authz.ts)).
Bare `requireAdmin()` is not enough — the flag check lives inside
`requireIngestionAdmin`.

## Runbook

To be filled in PR-D (#671 follow-up).

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

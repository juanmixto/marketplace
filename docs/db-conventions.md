# Database conventions

Rules extracted from the DB audit closed in #971 (PRs #982, #986, #989, #990, #995, #997, #998, #1000, #1001). They are the cheap conventions that prevent the audit from having to run again. Two of them are CI-enforced via [`scripts/audit-fk-onDelete.mjs`](../scripts/audit-fk-onDelete.mjs) and [`scripts/audit-unbounded-findMany.mjs`](../scripts/audit-unbounded-findMany.mjs); the rest live here as guidance.

Read this before:

- adding a new Prisma model,
- adding a `@relation` that points at `User`, `Order`, or `Vendor`,
- writing a new server action or page that calls `findMany`,
- handling a new webhook event from a third-party provider,
- adding a new `Decimal` or `Int` money column.

## 1. Foreign keys: every relation declares `onDelete:` explicitly

Prisma defaults `onDelete:` to `NO ACTION` when omitted. That is a defensible default in isolation, but it makes the *intent* invisible at the call site and lets a one-character schema change (`...references: [id])` → `...references: [id], onDelete: Cascade)`) silently turn into a data-loss migration.

The schema today still contains pre-existing implicit defaults (recorded in `scripts/audit-fk-onDelete.baseline.json`). New relations into `User`, `Order`, or `Vendor` MUST declare `onDelete:` explicitly. CI fails on net-new violations.

Reasoning grid for the choice:

| `onDelete:` | When to use |
|---|---|
| `Cascade` | The dependent row has no business value once its owner is gone (auth tokens, sessions, browser push subscriptions, scratch carts). Allowlist entry required in `audit-fk-onDelete.mjs`. |
| `Restrict` | The dependent row carries audit / tax / dispute weight (Order, Incident, Refund, Settlement, anonimized Review). The application-layer erase flow anonimizes the owner instead of deleting. |
| `SetNull` | The dependent row should survive but lose its association (rare — usually a sign that the relation should have been optional in the first place). |

`Cascade` onto `User` from a money- or audit-tied model is a hard CI failure (`CASCADE_ON_USER_FORBIDDEN` in the script). The 5-year tax retention requirement for orders is the canonical reason — see #961 and `docs/authz-audit.md` § Account erase contract.

## 2. `findMany` server-side is paginated by default

An unbounded `prisma.X.findMany({ where, ... })` is invisible at zero traffic and turns into a TTFB-killer the moment any vendor crosses a few hundred rows. Pre-tracción this trap is invisible — that's exactly why the audit caught it everywhere (#963 A/B/C).

Default to **cursor pagination** mirroring [`src/domains/catalog/queries.ts:62-231`](../src/domains/catalog/queries.ts):

- Stable sort with an `id` tiebreaker: `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`.
- `take: PAGE_SIZE + 1` probe — the extra row signals `hasNextPage` without a separate count query.
- `cursor: { id }` plus `skip: 1` for subsequent pages.
- Page size 20–25 unless there's a UX reason to go higher.
- Aggregates that must reflect the full population (KPI cards, totals, alert counts) live in a **separate query** that uses `count` / `groupBy` / a targeted aggregate. Never compute them in JS over a paginated slice.

Legitimate exceptions (workers, sitemap, KPI computation, settlement) are allowlisted in `scripts/audit-unbounded-findMany.mjs` with a one-line reason. CI tolerates the existing baseline; new violations fail.

**Where the page-size constant and filter type live:** `src/domains/<domain>/types.ts`. Server Actions modules (`actions.ts`) are `'use server'`, which forbids exporting anything other than async functions — see the rule in [`docs/conventions.md`](conventions.md#use-server-only-async). The trap is silent under `tsc --noEmit` and only surfaces under `next build`.

## 3. Money is `Decimal(10, 2)` with `currency` defaulting to `"EUR"`

The schema mixes `Decimal(10, 2)` (orders / payments / settlements / shipping rates) and `Int` cents (`IngestionProductDraft.priceCents`). The split is intentional, not legacy: ingestion is parsed, untrusted input (Telegram messages); the marketplace uses `Decimal` because that's what Stripe negotiates.

Rules when you add a money field:

- **Marketplace path (Order, Payment, Refund, Settlement, Promotion, ShippingRate, etc.):** `Decimal @db.Decimal(10, 2)` + `currency String @default("EUR")` if the model can carry a different currency than the order it belongs to. Don't introduce a Float.
- **Ingestion / untrusted input path:** `Int` cents. Keep the conversion at the publish boundary so a malformed extraction can never poison the marketplace tables.
- **Don't unify the two** before there's a real dolor de negocio. Three similar fields ≠ a framework.

`Decimal(5, 4)` is the right type for percentage rates (`commissionRate`, `taxRate`). Add a Postgres `CHECK (... BETWEEN 0 AND 1)` if you want runtime enforcement (#967 in backlog).

## 4. Webhook idempotency: two layers, never one

Stripe (and any other webhook provider) does not promise exactly-once delivery and does not promise event order. Defend at two layers:

1. **First-line dedupe:** `WebhookDelivery(provider, eventId)` `@@unique`. Insert-first / catch-`P2002` (see [`src/app/api/webhooks/stripe/route.ts`](../src/app/api/webhooks/stripe/route.ts)). This catches literal replays.
2. **Out-of-order watermark:** keep a `lastStripeEventAt` timestamp on the entity that the event mutates (`Subscription.lastStripeEventAt`, `Payment.lastStripeEventAt`). Drop any event whose `event.created` is older than the watermark before touching state. Advance the watermark **inside** the same `$transaction` that mutates the entity's status.

Either layer alone is insufficient. `WebhookDelivery` does not catch a `payment_intent.succeeded` arriving with a different `event.id` after a `charge.refunded` (#959). The watermark does not catch a literal replay of the exact same event id (#308).

When you handle a new provider event:

- Add a UNIQUE on whatever the provider's stable id is (`Refund.providerRef`, `Shipment.idempotencyKey`).
- Decide whether the entity needs a `lastEventAt` watermark.
- Add an integration test that sends the event twice and asserts the second pass is a no-op.

## 5. Critical `$transaction` calls pin `timeout` and `maxWait`

Prisma's interactive-transaction defaults have shifted between versions (5s → 10s). Money-mutating transactions hold pessimistic row locks (`SELECT ... FOR UPDATE` on `ProductVariant` during checkout) — a slow contender + an unspecified default = a silent rollback after the buyer entered a card.

Pin explicitly on the three money-critical paths (already done in #986):

```ts
await db.$transaction(async (tx) => { /* ... */ }, {
  timeout: 15_000,
  maxWait: 5_000,
})
```

Other `$transaction` sites can adopt the same constant when touched. No need to retrofit them all in one go.

## 6. Indexes follow the actual query, not the natural sort

`@@index([customerId, placedAt])` (ASC) is a different physical structure from `@@index([customerId, placedAt(sort: Desc)])`. Postgres can read either backwards, but a DESC-declared index lets the planner combine the sort with composite filters without an extra Backward Index Scan node — and matches the schema's intent (#964).

Rule: when you add an index, write it the way the query reads.

- "Mis pedidos" sorts `placedAt DESC` → `@@index([customerId, placedAt(sort: Desc)])`
- "Pagos exitosos para esta orden" filters by `(orderId, status)` → `@@index([orderId, status])` (not just `[orderId]`)
- "Productos por vendor activos" filters by `(vendorId, status)` → `@@index([vendorId, status])`

## 7. JSON columns get a Zod parser at the read boundary

`Json` / `Json?` columns are useful for snapshots (`Order.shippingAddressSnapshot`, `OrderEvent.payload`, `IngestionExtractionResult.payload`). They're also a silent compatibility break the day a writer changes the shape: existing rows still parse, but the reader's expectations don't match.

Two conventions:

- **Schema-version on the column:** add a sibling `schemaVersion Int @default(1)` (already on `OrderEvent` since #965). Bump it in code when the writer changes the payload shape; readers branch on the stored value when they walk historical rows.
- **Zod parser at read time:** every read of a `Json` column goes through a versioned Zod schema (see `parseOrderAddressSnapshot`, `orderLineSnapshotSchema`). Validation lives in `src/types/` or the relevant domain `types.ts`.

Don't validate at write time only — old rows predate the validation, and a strict write-side schema gives a false sense of security.

## 8. Account erase is anonimization, never hard-delete

GDPR Art. 17 is implemented by [`src/app/api/account/delete/route.ts`](../src/app/api/account/delete/route.ts). The User row is anonimized in place; everything below it is either scrubbed, deleted, or retained per the per-model rule:

| Model | On erase | Reason |
|-------|----------|--------|
| `User` | anonimized (email/name/image cleared, `tokenVersion` bumped, `deletedAt` set) | RESTRICT FK from Order/Review/Incident; tax retention 5 y |
| `Address` | deleted | not needed once orders are placed; orders snapshot the address in `Json` |
| `Review.body` | scrubbed (set to `null`); `rating` retained | rating is product-attached, not user-attached |
| `Session` | deleted | invalidates active cookies immediately |
| `Account` | deleted (#1350) | OAuth `refresh_token`/`id_token` are live credentials of the erased user |
| `Cart` (+ `CartItem` cascade) | deleted (#1350) | preference/scratch state |
| `PushSubscription` | deleted (#1350) | endpoint+UA fingerprint user |
| `TelegramLink` | deleted (#1350) | chat id maps to a real Telegram account |
| `Order` / `Incident` / `Settlement` / `OrderEvent` | retained | RESTRICT FK; legal / financial audit |

A single `AuditLog` row with `action='USER_SELF_ERASED'` and `actorId=userId` is written inside the same transaction so a successful erase always leaves a forensic trail; a failure rolls everything back together.

When you add a new User-owned model:

- Decide whether it survives erase (legal requirement / business audit) or follows the user out (preference / scratch / token).
- Declare `onDelete:` accordingly — `Restrict` for survivors, `Cascade` for followers (with allowlist entry).
- Update the table above + [`docs/authz-audit.md`](authz-audit.md) § Account erase contract if the answer changes the contract.
- Either anonimize / delete it inside the same `db.$transaction(...)` in `route.ts` or document why it's exempt.
- Add a row-count assertion to [`test/integration/account-erase-coverage.test.ts`](../test/integration/account-erase-coverage.test.ts) so future regressions trip the suite.

The CI guard in `audit-fk-onDelete.mjs` won't catch missing erase logic — it only catches FK declarations. Don't rely on it for the full contract.

## 8b. At-rest encryption for column-scoped PII

GDPR Art. 32 + financial-data classification require AES-256-GCM at rest for IBAN, OAuth tokens, 2FA secrets, and any equivalent live credential. Plaintext columns leak into every backup, DB-tool screenshot, and replica.

Live key domains (one per `keyDomain` argument; bump `:v2` for rotation):

| Key domain | Column(s) | Issue |
|------------|-----------|-------|
| `user-two-factor:v1` | `UserTwoFactor.secretEncrypted` | #551 |
| `vendor-iban:v1` | `Vendor.ibanEncrypted` | #1347 |
| `vendor-bank-name:v1` | `Vendor.bankAccountNameEncrypted` | #1347 |
| `oauth-token:v1` | `Account.refresh_token`, `Account.id_token` (in-place ciphertext) | #1349 |

The pattern (see [`src/lib/at-rest-crypto.ts`](../src/lib/at-rest-crypto.ts), [`src/domains/vendors/bank-crypto.ts`](../src/domains/vendors/bank-crypto.ts) and [`src/domains/auth/oauth-token-crypto.ts`](../src/domains/auth/oauth-token-crypto.ts)):

- One generalised primitive `encryptForStorage(plaintext, keyDomain)` / `decryptFromStorage(wire, keyDomain)`. Wire format `iv.ct.tag` (base64 dotted), tag length pinned to 16 bytes on encrypt and decrypt.
- Each domain derives its OWN HKDF-SHA256 key from `AUTH_SECRET` via a unique `keyDomain` string (e.g. `'vendor-iban:v1'`, `'vendor-bank-name:v1'`). Domain separation means a leaked ciphertext class cannot decrypt another, and bumping `:v2` is the rotation hook.
- Sibling unencrypted column for "last-N" UI hints (`Vendor.ibanLast4`) so list pages render `**** 1234` without per-row crypto.
- Migration is dual-column for one release: add `*Encrypted` alongside the legacy plaintext column; new writes only touch the encrypted column and write the plaintext back to `null`; a backfill script (`scripts/migrate-vendor-iban-encrypt.ts` is the template) encrypts existing rows; a follow-up migration drops the plaintext columns once `count(*) WHERE plaintext_col IS NOT NULL` is 0 in prod.
- Backfill scripts MUST refuse to start when `AUTH_SECRET` is missing or has the dev-fallback shape — running with the wrong key produces unrecoverable rows.
- Tests assert the on-disk shape (`isStorageWireFormat(...)` + plaintext substring NOT in the JSON-stringified row) — round-trip alone is not enough, because round-trip succeeds even if you accidentally also keep the plaintext.

For columns NextAuth's `PrismaAdapter` writes (`Account.refresh_token` / `id_token`), the dual-column window is unnecessary because no in-app code reads them — wrap the adapter's `linkAccount` to encrypt before write and reuse the existing columns as ciphertext storage. The override lives in [`src/lib/auth.ts`](../src/lib/auth.ts) `buildAdapter`. `Account.access_token` is intentionally written as `null` to remove an entire class of leak (we don't refresh it; JWT session strategy doesn't need it).

## 8c. Actor tracking on high-value rows (#1359)

Second source of truth, independent of `AuditLog`. If the audit table is purged under retention or a writer-side bug skips the audit row, the four high-value models still answer "who created this and who last touched it":

- `User`, `Vendor`, `Product`, `Order` — each carries `createdById String?` + `updatedById String?`.
- Stored as plain string (no FK to `User`) so sentinel writers (`'system'`, `'stripe-webhook'`, `'cron-X'`) fit, and a later GDPR anonimization of the actor doesn't cascade or rewrite the row.
- Historical rows stay null — no backfill, no implied `createdById = User.id` for legacy.
- Helpers in [`src/lib/actor-tracking.ts`](../src/lib/actor-tracking.ts):
  - `trackCreate(actor)` → `{ createdById, updatedById }` for `db.X.create`
  - `trackUpdate(actor)` → `{ updatedById }` for `db.X.update`
- `actor` accepts a real id, `null`, or the `SYSTEM` sentinel (literal `'system'` for greppability).

When you add an admin mutation that touches one of the four tables, spread `...trackUpdate(session.user.id)` into the `data` object. When you add a system writer (webhook handler, cron job, worker), spread `...trackUpdate(SYSTEM)` so the row is recognisably non-human.

## 9. Status transitions are linted, not hand-waved

Order, Payment, Settlement, and VendorFulfillment status changes are part of the state-machine contract. Direct `status:` writes outside the dedicated transition modules are a common way to bypass guards, lose audit-trail context, or apply an invalid state change from a random writer.

The ratchet script [`scripts/audit-status-write.mjs`](../scripts/audit-status-write.mjs) enforces that:

- `order`, `payment`, `settlement`, and `vendorFulfillment` updates that set `status:` stay behind the transition modules.
- `src/domains/*/state-machine.ts` is the intended home for the transition wrappers.
- `src/domains/payments/webhook.ts` is temporarily allowlisted because it already participates in the payment transition contract.

Like the other audits, the script keeps a baseline of pre-existing writes and only fails on net-new violations. Shrink the baseline as state-machine adoption spreads.

## See also

- [`docs/checkout-dedupe.md`](checkout-dedupe.md) — cart-shape hash + `Order.checkoutAttemptId` UNIQUE
- [`docs/idempotency.md`](idempotency.md) — generic `IdempotencyKey(scope, token)` for admin/vendor mutations
- [`docs/state-machines.md`](state-machines.md) — Order / Payment / Fulfillment / Shipment transitions
- [`docs/orderevent-vs-webhookdelivery.md`](orderevent-vs-webhookdelivery.md) — separation of concerns
- [`docs/authz-audit.md`](authz-audit.md) — resource-level authorization + cross-tenant negative tests

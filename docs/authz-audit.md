# Resource-level authorization audit

Verified 2026-04-18 as part of issue #310. Route-level gating (`src/lib/auth-config.ts` middleware) is **necessary but not sufficient** — every sensitive mutation or read must also verify the caller's relationship to the specific resource. This doc is the canonical checklist for reviewers and future agents: when adding a new server action or route handler, confirm it satisfies the rules below before merging.

## Rules

1. **Identity**: every sensitive operation calls `getActionSession()` / `requireAuth()` / `requireRole()` / one of the `require*Admin()` helpers in [`src/lib/auth-guard.ts`](../src/lib/auth-guard.ts). Never trust URL params or form fields for identity.
2. **Ownership**: mutations and reads that touch a user-owned resource scope the Prisma query by the caller's id — `vendorId: vendor.id`, `customerId: session.user.id`, `userId: session.user.id`. `findFirst` with the ownership predicate is the standard idiom; `findUnique` with a later equality check is acceptable if the message must not leak existence.
3. **Role precision**: admin actions use the narrowest role helper that still passes production traffic — `requireFinanceAdmin()`, `requireCatalogAdmin()`, `requireOpsAdmin()`, `requireSuperadmin()`. Never use `requireAuth()` + inline role check; that pattern drifts silently.
4. **Denial behaviour**: when the check fails, throw or redirect — never return empty data that the UI could misread as "no results". The standard errors are `IncidentAuthError` / inline `throw new Error('X no encontrado')`. Message must not disclose whether the resource exists for someone else.
5. **Negative test**: every new protected action gets at least one cross-tenant negative test in `test/integration/*-auth-audit.test.ts` or an equivalent file. Positive tests prove the happy path; negatives prove the guard.

## Guard helpers

| Helper | File | Purpose |
|---|---|---|
| `requireAuth()` | `src/lib/auth-guard.ts` | Any logged-in user |
| `requireRole(roles[])` | `src/lib/auth-guard.ts` | Arbitrary role list |
| `requireVendor()` | `src/lib/auth-guard.ts` + `src/domains/vendors/actions.ts` | Vendor role + resolve `vendor` row |
| `requireAdmin()` | `src/lib/auth-guard.ts` | Any admin subrole |
| `requireSuperadmin()` | `src/lib/auth-guard.ts` | SUPERADMIN only |
| `requireCatalogAdmin()` | `src/lib/auth-guard.ts` | Catalog moderation |
| `requireFinanceAdmin()` | `src/lib/auth-guard.ts` | Settlement / payouts |
| `requireOpsAdmin()` | `src/lib/auth-guard.ts` | Order cancellation, incident resolution |

## Cross-tenant negative coverage

| Domain | Test file |
|---|---|
| Orders (buyer ↔ buyer, vendor ↔ fulfillment) | [`test/integration/orders-auth-audit.test.ts`](../test/integration/orders-auth-audit.test.ts) |
| Incidents (buyer ↔ buyer, admin route) | [`test/integration/incidents-buyer.test.ts`](../test/integration/incidents-buyer.test.ts), [`test/integration/api-incidents-auth.test.ts`](../test/integration/api-incidents-auth.test.ts) |
| Vendor products / promotions / fulfillments | [`test/integration/vendor-cross-vendor-isolation.test.ts`](../test/integration/vendor-cross-vendor-isolation.test.ts) |
| Review response / deletion, variant sync | [`test/integration/vendors-auth-audit.test.ts`](../test/integration/vendors-auth-audit.test.ts) |
| Buyer addresses (API routes) | [`test/integration/api-direcciones-auth.test.ts`](../test/integration/api-direcciones-auth.test.ts) |
| Buyer subscriptions | [`test/integration/buyer-subscriptions-cross-buyer.test.ts`](../test/integration/buyer-subscriptions-cross-buyer.test.ts) |
| Vendor read actions (`getMyProduct`, etc.) | [`test/integration/buyer-vendor-reads.test.ts`](../test/integration/buyer-vendor-reads.test.ts) |
| Admin sub-role gates | [`test/integration/admin-sub-role-gates.test.ts`](../test/integration/admin-sub-role-gates.test.ts) |
| API route authz presence | [`test/integration/api-route-auth-audit.test.ts`](../test/integration/api-route-auth-audit.test.ts) |
| GDPR account-erase (anonimize, never hard-delete) | [`test/integration/gdpr-compliance.test.ts`](../test/integration/gdpr-compliance.test.ts), [`test/integration/account-erase-fk-restrict.test.ts`](../test/integration/account-erase-fk-restrict.test.ts), [`test/integration/account-erase-coverage.test.ts`](../test/integration/account-erase-coverage.test.ts) |

### Account erase contract (#961, extended #1350)

`/api/account/delete` (DELETE) is the GDPR Article 17 surface. Required behaviours:

- The User row is **anonimized** (`email = deleted_<id>@anon.invalid`, `passwordHash = null`, `deletedAt`, placeholder `firstName/lastName`), never hard-deleted.
- Orders, Incidents, and Reviews stay (5-year tax retention; rating signal preserved).
- Addresses and Sessions are deleted; Reviews are anonimized in place (`body=null`, rating retained).
- **PII satellites are deleted in the same transaction** (#1350): `Account` (OAuth tokens), `Cart` (+ `CartItem` cascade), `PushSubscription`, `TelegramLink`. Without this, a "deleted" user keeps live OAuth credentials, push endpoints and chat-id mappings tied to its anonimized row.
- A single `AuditLog` row with `action='USER_SELF_ERASED'`, `entityType='User'`, `entityId=userId`, `actorId=userId` is written inside the same transaction so the erasure itself is forensically trackable. Failure of any step rolls everything back together (no half-erased state).
- Schema-level guard: `Order.customerId`, `Review.customerId`, `Incident.customerId` declare `onDelete: Restrict`. A future `prisma.user.delete()` (intentional or accidental) is rejected at the FK layer with `P2003`. This is regression-tested in `account-erase-fk-restrict.test.ts`.

This list is the contract. Adding a new User-owned model that is order-tied (e.g. invoices, support tickets, downloadable assets) MUST also declare `onDelete: Restrict` on its `userId` / `customerId` FK; a new PII-bearing satellite (push, oauth, social link, preference cache) MUST be added to the transaction in `route.ts` and a row-count assertion appended to `account-erase-coverage.test.ts`.

### Admin queries: explicit `select` (#1351)

`db.X.findMany({ include: { Y: true } })` inside `src/domains/admin/` is a PII over-exposure vector — the entire related row (every column, including phone / email / line2) leaves the server on every list render. Use `include: { Y: { select: { ... } } }` and name only the columns the UI actually renders.

Live trims after #1351:

| Loader | Relation | Columns kept | Reason |
|--------|----------|--------------|--------|
| `getAdminOrdersPageData` (`src/domains/admin/orders.ts`) | `address` | `city`, `province`, `postalCode`, `country` | Detail panel reads `shippingAddressSnapshot` (Json) for full PII |
| `getProducersOverview` (`src/domains/admin/producers.ts`) | `user` | `id`, `email` | Email loaded server-side for the search filter (Set-by-id) but stripped from `EnrichedProducer` before crossing the wire |

CI guard: [`scripts/audit-admin-explicit-select.mjs`](../scripts/audit-admin-explicit-select.mjs) fails the build on any new `address: true` / `customer: true` / `user: true` / `incidents: true` inside `src/domains/admin/`. When you add a new admin loader, declare the columns the UI renders and add a row to the table above.

### Admin search audit (#1353)

`getAdminOrdersPageData` accepts a free-text `q` filter that legitimately matches `orderNumber` / vendor name / product name BUT also lets an admin enumerate the customer base by typing `@gmail.com` / `+346…` / `28010`. Without an audit trail this is a stalking vector AND a data-extraction vector with no forensic record.

`auditAdminSearch` ([`src/domains/admin/search-pii.ts`](../src/domains/admin/search-pii.ts)) classifies the input as `email` / `phone` / `postal` / `free-text` and:

- For PII inputs, writes one `AuditLog` row with `action='DATA_SEARCH'`, `entityType='<scope>'`, `entityId=sha256(q)`, `after={qHash, kind, matchedCount}`. The literal email / phone / CP NEVER lands in the audit table — only the hash, so a forensic investigator who already suspects a value can confirm the match without the audit table itself becoming a PII surface.
- Free-text inputs are not audited (orderNumber is not personal data).
- Emits `admin.search.pii_burst` (logger.warn) when the actor crosses 20 PII searches in 10 minutes — that's the signal PostHog/Sentry alerts watch.

When you add a new admin search surface (vendors, products, incidents), call `auditAdminSearch({ scope, actorId, actorRole, query, matchedCount })` from the loader. Test contract: [`test/integration/admin-search-pii-audit.test.ts`](../test/integration/admin-search-pii-audit.test.ts).

### Admin mutation rate limits (#1352)

Authz alone does not prevent a *legitimate* admin from running away — a stolen cookie, a misconfigured CRON, or an automation gone wrong all look like real signed sessions to `requireOpsAdmin`. `enforceAdminMutationRateLimit` ([`src/domains/admin/rate-limit.ts`](../src/domains/admin/rate-limit.ts)) is the second layer.

Live limits per actor and scope:

| Mutation | Scope key | Limit | Window |
|----------|-----------|-------|--------|
| `approveVendor` / `rejectVendor` / `suspendVendor` | `vendor-moderation` | 30 | 60 s |
| `reviewProduct` (approve/reject) / `suspendProduct` | `product-moderation` | 30 | 60 s |
| `POST /api/admin/incidents/[id]/resolve` (refunds) | `incident-resolve` | 5 | 60 s |

Refunds intentionally use the strictest bucket — that surface is direct money movement. The 80%-warning event (`admin.mutation.rate_warning`) fires before the actual 429 so PostHog/Sentry alerts can catch a runaway loop one warning before it becomes user-visible. See [`test/integration/admin-mutation-rate-limit.test.ts`](../test/integration/admin-mutation-rate-limit.test.ts) for the contract.

When you add a new admin mutation that mutates state visible to vendors / customers / money — do NOT skip this guard. The audit trail (`mutateWithAudit`) is forensic, not preventive; the rate limit is what stops a 1000-rps loop from completing.

## Audit results (2026-04-18)

Systematic sweep of `src/domains/*/actions.ts`, `src/app/api/**/route.ts`, and dynamic-segment `page.tsx` files under protected route groups. **No gaps.** Every sensitive mutation:

- calls an identity helper,
- scopes its Prisma query by the caller's id, or checks ownership explicitly after a `findUnique`,
- throws / redirects on mismatch.

Dynamic-segment pages (`/vendor/[id]/*`, `/admin/[id]/*`, `/cuenta/[id]/*`) all scope by `vendor.id` / `session.user.id` or sit behind the appropriate `require*Admin()` guard. The admin incident routes (`/api/admin/incidents/[id]/*`) grant message/resolve access to any admin — intentional, since admin = can act on all incidents for support.

## When this changes

Update the coverage table above whenever you add a new `*-auth-audit.test.ts` file. Re-run the audit (grep for `"use server"`, `export async function` in `src/app/api/**/route.ts`, and dynamic `[param]` page.tsx files) whenever a new domain module lands. If a new role helper is introduced, add it to the Guard Helpers table.

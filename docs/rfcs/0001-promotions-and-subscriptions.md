# RFC 0001 — Promotions & Subscriptions

- **Status:** Active — phases 1–5 shipped (2026-04-14/15)
- **Author:** Vendor portal UX initiative
- **Created:** 2026-04-14
- **Last updated:** 2026-04-15
- **Related:** vendor product preview PR (#332) — initial vendor-portal UX upgrade
- **Shipped in:** #335 (phase 1 promos CRUD), #336 (phase 2 checkout), #337 (phase 3 plan CRUD), #338 (phase 4a buyer lifecycle), #339–#342 (phase 4b α/β/γ/δ Stripe integration + emails), #343 (phase 5 admin read-only), #344 (Decimal/RSC serialization fix), #355 (superadmin write access)

## Motivation

The vendor portal ships two growth levers that are not yet wired up in the product:

1. **Promotions** — vendors want to run short discounts ("-10% this weekend", "2x1 on 500g jars", "free shipping over 30€") to clear seasonal stock and drive first-time buyers. Today the only knob is `Product.compareAtPrice`, which is a static strike-through price with no start/end window, no code, no stacking rules, no analytics.

2. **Subscriptions** — several producers have asked for a "weekly box" product so buyers can subscribe to the same basket every Monday. This is not the same as a recurring digital product (SaaS): it is a *fulfilled, physical, vendor-shipped box* with renewal billing, skip / pause / cancel UX, and tax handling per delivery. Today there is no concept of recurring orders at all.

Both are **multi-week** features that touch schema, checkout, payments, emails, the vendor portal, the buyer account area and admin. This RFC proposes the model and a phased plan before any code is written, so we can merge small, reversible PRs against a shared target.

## Non-goals (explicit)

- Not designing a loyalty/points system. That is a separate lever.
- Not exposing Stripe Coupons directly — we want our own domain model that *happens to* use Stripe Coupons/Promotion Codes underneath where convenient.
- Not implementing bundles or "buy-one-get-one" in phase 1. They are listed under "future extensions".
- Not changing how commission / settlement works — promotions discount the buyer price, and the vendor absorbs the discount unless marked as a platform-funded promotion.

## Open questions (need product decisions before phase 1)

1. **Who funds the discount?** Vendor-funded only for phase 1, or also platform-funded campaigns (marketing budget)? → *proposal: vendor-funded only in phase 1; add a `fundedBy` enum to leave room for `PLATFORM` later without a migration.*
2. **Stacking rules?** Can a buyer use a promo code **and** a product-level discount **and** a subscription discount at once? → *proposal: no stacking in phase 1; the cheapest-eligible rule wins, surfaced in the cart.*
3. **Scope granularity.** Can promos target a single product, a whole vendor, a category, a certification (ECO-ES)? → *proposal: `product | vendor | category` in phase 1; certification-scoped in phase 2.*
4. **Subscriptions — fixed cadence or vendor-defined?** Weekly / biweekly / monthly, or arbitrary cron? → *proposal: a closed enum `WEEKLY | BIWEEKLY | MONTHLY` in phase 1; revisit if vendors ask for more.*
5. **Subscription payment rail.** Use Stripe Subscriptions + Stripe Billing, or keep charges ad-hoc via our existing Stripe Connect flow with a scheduled job? → *proposal: Stripe Subscriptions with Connect destination charges. This offloads retries, dunning, SCA, and invoices. The tradeoff is that pause/skip becomes a Stripe API dance.*
6. **Skip window.** If a buyer skips a delivery, how far in advance must they do it? → *proposal: until the cutoff day of the vendor (vendor-defined, default Friday 23:59 for a Monday delivery).*
7. **Tax on subscriptions.** Are renewal prices locked at subscription start, or re-evaluated per delivery? → *proposal: price + tax locked at subscription creation; a vendor price change only affects new subscriptions. Communicate via email.*

These are **load-bearing decisions** — none of the code below should land until the product answers are locked, because the schema depends on them.

## Proposed data model

### Promotion

```prisma
model Promotion {
  id             String          @id @default(cuid())
  vendorId       String
  vendor         Vendor          @relation(fields: [vendorId], references: [id])

  name           String          // internal label, vendor-visible
  code           String?         @unique  // optional public coupon code
  kind           PromotionKind   // PERCENTAGE | FIXED_AMOUNT | FREE_SHIPPING
  value          Decimal         @db.Decimal(10, 2) // meaning depends on kind

  scope          PromotionScope  // PRODUCT | VENDOR | CATEGORY
  productId      String?
  categoryId     String?

  minSubtotal    Decimal?        @db.Decimal(10, 2)
  maxRedemptions Int?
  perUserLimit   Int?            @default(1)
  redemptionCount Int            @default(0)

  startsAt       DateTime
  endsAt         DateTime
  isActive       Boolean         @default(true)

  fundedBy       PromotionFunder @default(VENDOR) // leave room for PLATFORM
  stripeCouponId String?         // when we push to Stripe for cart-time validation

  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@index([vendorId, isActive, startsAt, endsAt])
  @@index([code])
}

enum PromotionKind      { PERCENTAGE FIXED_AMOUNT FREE_SHIPPING }
enum PromotionScope     { PRODUCT VENDOR CATEGORY }
enum PromotionFunder    { VENDOR PLATFORM }
```

### Subscription

```prisma
model SubscriptionPlan {
  id          String   @id @default(cuid())
  vendorId    String
  vendor      Vendor   @relation(fields: [vendorId], references: [id])
  productId   String   // the "box" product
  product     Product  @relation(fields: [productId], references: [id])

  cadence     SubscriptionCadence // WEEKLY | BIWEEKLY | MONTHLY
  priceSnapshot Decimal  @db.Decimal(10, 2) // locked at creation
  taxRateSnapshot Decimal @db.Decimal(4, 4)
  cutoffDayOfWeek Int     // 0-6, vendor's skip/cancel deadline

  stripePriceId String?   // Stripe Price id for the recurring charge
  isActive    Boolean     @default(true)
  createdAt   DateTime    @default(now())

  @@index([vendorId, isActive])
}

model Subscription {
  id              String              @id @default(cuid())
  buyerId         String
  buyer           User                @relation(fields: [buyerId], references: [id])
  planId          String
  plan            SubscriptionPlan    @relation(fields: [planId], references: [id])

  status          SubscriptionStatus  // ACTIVE | PAUSED | CANCELED | PAST_DUE
  stripeSubscriptionId String?        @unique
  currentPeriodEnd DateTime
  skippedDeliveries Json              @default("[]") // array of ISO dates

  shippingAddressId String
  createdAt       DateTime            @default(now())
  canceledAt      DateTime?

  @@index([buyerId, status])
}

enum SubscriptionCadence { WEEKLY BIWEEKLY MONTHLY }
enum SubscriptionStatus  { ACTIVE PAUSED CANCELED PAST_DUE }
```

### Migration safety

- Both models are additive — no changes to existing tables, no backfill needed.
- The only edit to an existing table is `Product.isSubscribable: Boolean @default(false)` so the vendor can flag a product as "this is a subscription box".
- All indexes are `@@index`, not `@@unique`, except `Promotion.code` and `Subscription.stripeSubscriptionId` where uniqueness is real.

## Phased rollout

| Phase | Scope | Why now |
| ----- | ----- | ------- |
| **0** | RFC approval + product decisions on open questions. | Nothing merges until these are locked. |
| **1** | Promotion CRUD in the vendor portal (list, create, archive). No checkout integration yet — promos are dormant. Admin read-only view. Prisma migration + server actions + tests. | Smallest useful slice. Lets vendors draft campaigns while checkout work is in flight. |
| **2** | Checkout integration — cart evaluates applicable promotions, applies the best eligible one, shows savings. Stripe Coupon sync. Order model captures `promotionId` + `discountAmount`. Invoice/email reflects discount. | This is where value lands for buyers. |
| **3** | Subscription plan CRUD in the vendor portal (mark product as subscribable, choose cadence, cutoff day). Still no buyer-facing purchase. | Vendors can prepare catalog. |
| **4** | Buyer subscription purchase flow — Stripe Subscriptions creation, buyer account "Mis suscripciones" section (list, skip next, pause, cancel). Renewal webhook creates a new Order + VendorFulfillment. Emails (renewal confirmation, skip reminder, payment failed). | Full subscription loop. |
| **5** | Admin dashboards: active campaigns, subscription churn, MRR per vendor. | Observability after the feature is live. |

Each phase is a **separate PR**, each with its own tests and migration. Phases 1–2 are independent of 3–4, so they can ship in either order.

## Testing strategy

- **Contracts**: i18n parity for all new vendor-portal strings; strict "no hardcoded literals" scan already covers `src/components/vendor/**` so it will catch drift automatically.
- **Integration**: Promotion eligibility and stacking rules (one test per rule), Stripe Subscription lifecycle (created, renewed, payment_failed, canceled) against a mocked Stripe. Subscription skip-window enforcement.
- **E2E**: Buyer applies a promo code at checkout → sees discount → places order → invoice email reflects discount. Buyer creates a subscription → skips next delivery → renewal fires → new order appears in their history.

## Risks

- **Stripe coupling**: once subscriptions are live, losing Stripe is a P0 incident. Mitigate with Stripe's own dunning + our own renewal-failed email fallback.
- **Price drift**: a vendor editing a product price after an active subscription exists must NOT retroactively change the subscribed price. The `priceSnapshot` field locks this, and a test will enforce it.
- **Double discounting**: the "no stacking" rule in phase 1 must be enforced at the server action level, not only in the UI, to avoid a buyer crafting a request that bypasses the UI check.
- **Scope creep**: this is the single biggest risk. This RFC is explicitly narrow (no loyalty, no bundles, no referrals). Anyone wanting those should open a separate RFC.

## Decision log (to be filled in)

| Date       | Decision | Made by | Rationale |
| ---------- | -------- | ------- | --------- |
|            |          |         |           |

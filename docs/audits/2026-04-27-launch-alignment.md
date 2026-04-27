---
title: Launch alignment audit — code vs business+product strategy
date: 2026-04-27
audited_against: origin/main @ ce8a48b0
auditor: Opus 4.7 (1M context) via Claude Code
docs_anchor:
  - docs/business/01-08
  - docs/product/01-04
  - docs/business/10-launch-backlog.md
verification: every finding re-grepped/re-read against worktree at HEAD; citations valid for ce8a48b0
---

# Launch alignment audit (2026-04-27)

> Senior marketplace + SaaS audit answering: **does the current code help or hurt the documented strategy?** Strategy = marketplace curado, pocos productores, productos artesanales, confianza alta, mobile excelente, validar antes de escalar, evitar sobreingeniería.
>
> Companion to [`docs/business/10-launch-backlog.md`](../business/10-launch-backlog.md). The backlog enumerates *what to build*; this audit enumerates *what already exists, what contradicts the strategy, and what to hide before opening to traffic*.

## Executive diagnosis

The code is **well above** what the strategy requires for soft launch — and counterintuitively, that **is the number-one problem**.

- **Strategy alignment is strong on**: curated home with productores+categories, PWA (SW, manifest, share_target), mobile-first listing+PDP with productor visible per card, CF-1 funnel analytics already wired (45 `trackAnalyticsEvent` call-sites covering `view_item` → `add_to_cart` → `begin_checkout` → `purchase`).
- **Strategy alignment fails on**: PDP shows no shipping ETA or cost (breaks `producto/01.md § 1` "Confianza sobre cleverness" and `business/04.md § Envío`); no `Pack`/`Bundle` model in Prisma despite `business/04.md` calling packs "the AOV lever"; `vendor/suscripciones` and `vendor/promociones` + `admin/promociones` UIs fully built despite `business/04.md § Modelos que NO usamos` explicitly excluding both at this phase; producer profile page exists but lacks editorial story / proper foto / proceso (currently a product list).
- **Dominant risk**: maintenance curve of code already shipped (18 admin sections + 9 vendor sections + full ingestion pipeline + retired web push + complete social-login epic) is **larger than the team needed to operate 50 orders/week**. The launch backlog adds; this audit recommends **deciding what to hide / kill-switch / gate before going public**.

**Recommendation: GO partial — soft launch private (invite-only). NO-GO for SEO/paid traffic until the 5 P0s are closed.**

## Findings table

| # | Surface | Finding | Evidence | Alignment | Severity |
|---|---|---|---|---|---|
| H1 | Home | Hero curated with KPIs (count/rating/percent), trust row (envío/pago/verificado), Schema.org Org+WebSite | `src/app/(public)/page.tsx:66-117,176-183` | ✅ Aligned | — |
| H2 | Home | "Cómo funciona" + featured productores grid | `src/app/(public)/page.tsx:335-421` | ✅ Aligned | — |
| H3 | Listing | `ProductCard` mobile-first with productor + location + rating + cert badges; cursor pagination | `src/components/catalog/ProductCard.tsx:91-220`, `src/app/(public)/productos/page.tsx:51-57,294-295` | ✅ Aligned | — |
| H4 | Listing | Filters via mobile drawer + `SortSelect` | `src/components/catalog/ProductFiltersPanel.tsx`, `MobileFilters` import | ✅ Aligned | — |
| H5 | **PDP** | **`ProductPurchasePanel` shows no shipping ETA or cost** before checkout. 0 matches for `ship\|envio\|plazo\|delivery` in the component. | `grep -n -E "ship\|envio\|plazo\|delivery" src/components/catalog/ProductPurchasePanel.tsx` → 0 lines | ❌ Breaks `producto/01.md § 1` and `business/04.md § Envío` | **P0** |
| H6 | PDP | Sticky CTA via IntersectionObserver | `src/components/catalog/ProductPurchasePanel.tsx:63,108-120` | ✅ Aligned | — |
| H7 | PDP | Vendor link + aggregated reviews | `src/app/(public)/productos/[slug]/page.tsx` | ✅ Aligned | — |
| H8 | Producer profile | `/productores/[slug]` exists with hero, description, products, rating | `src/app/(public)/productores/[slug]/page.tsx:1-100` | 🟡 Partial — missing editorial story, productor photo (not logo), process, location map | **P0** (E2-01 backlog) |
| H9 | Cart | Separate `/carrito` route | `src/app/(buyer)/carrito/page.tsx` | ✅ Aligned | — |
| H10 | **Checkout** | **Guest checkout works** (auth doesn't gate; only pre-loads addresses if session) — but no visible "Comprar como invitado" CTA | `src/app/(buyer)/checkout/page.tsx:14-60`; `CheckoutPageClient` exposes no toggle | 🟡 Works but unsignaled | P1 |
| H11 | Checkout | Server-issued idempotency token + `force-dynamic` + correct `autoComplete` keys | `src/app/(buyer)/checkout/page.tsx:13,66`; `src/components/buyer/CheckoutPageClient.tsx:528-571` | ✅ Aligned | — |
| H12 | Checkout | No visible Apple/Google Pay toggle; provider abstracted | `src/app/(buyer)/checkout/page.tsx:23` | 🟡 Verify Stripe Element config | P1 |
| H13 | Mobile | 13 `loading.tsx` skeletons; PWA manifest complete (standalone, share_target, shortcuts); SW built from template | `find src/app -name loading.tsx` → 13; `src/app/manifest.ts`; `scripts/build-sw.mjs` | ✅ Aligned (slight overengineering on SW: image cache + share_target unused) | — |
| H14 | Mobile | `SafeImage` adapts quality to connection | `src/components/catalog/SafeImage.tsx:23` | ✅ Aligned | — |
| H15 | Analytics | **45 `trackAnalyticsEvent` call-sites**: `view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `sign_up`, `filter_used`, `seller_*`, `network_error`, `offline_fallback_shown` | `grep -rn "trackAnalyticsEvent(" src/` | ✅ E7-01 backlog **already ~80% done** | — |
| H16 | **Data model** | **No `Pack`/`Bundle`/`Combo` model** in Prisma | `grep -E "model (Pack\|Bundle\|Combo)" prisma/schema.prisma` → 0 lines | ❌ Blocks E4-01 + AOV hypothesis in `business/04.md` | **P1** (not pre-soft) |
| H17 | **Overengineering** | `vendor/suscripciones` complete (`[id]/`, `nueva/`, `suscriptores/`) | `ls src/app/(vendor)/vendor/suscripciones/` | ❌ `business/04.md § Modelos que NO usamos` explicitly excludes | **P0** (hide) |
| H18 | **Overengineering** | `vendor/promociones` + `admin/promociones` complete | `ls src/app/(vendor)/vendor/promociones src/app/(admin)/admin/promociones` | ❌ Without traffic there are no promos to test | **P0** (hide) |
| H19 | Overengineering | 18 admin sections (`auditoria`, `analytics`, `informes`, `notificaciones`, `security`, `liquidaciones`, `comisiones`, `configuracion`, …) | `ls src/app/(admin)/admin/` | 🟡 Possible excess for 50 orders/week | **P1** |
| H20 | Overengineering | Telegram ingestion Phases 1–4 complete; gated by `kill-ingestion-*` default-killed | memories `ingestion_phase{1..4}_closed` | ✅ Well isolated by flag, not operational ballast | — |
| H21 | Static pages | `sobre-nosotros`, `terminos`, `privacidad`, `cookies`, `faq`, `contacto`, `como-funciona`, `como-vender`, `aviso-legal` exist | `ls src/app/(public)/` | 🟡 **Missing dedicated `/envios` and `/devoluciones` pages** (likely embedded in `terminos`) | **P0** |
| H22 | Notifications | Telegram + Resend wired; web-push retired (memory #859) | `src/domains/notifications/`, `src/lib/email.ts` | ✅ Aligned | — |
| H23 | Vendor onboarding | Self-service `/cuenta/hazte-vendedor` with `VendorApplicationForm` (PENDING/ACTIVE/REJECTED) | `src/app/(buyer)/cuenta/hazte-vendedor/page.tsx` | 🟡 Contradicts `business/02.md` "onboarding asistido y validado a mano" — convert to invitation request | **P1** |
| H24 | Auth | Social login complete (epic #848) gated by `kill-auth-social` | memory `social_login_epic_ready` | ✅ Well gated | — |
| H25 | i18n | ~480 keys ES+EN admin/buyer/vendor | memory `admin_i18n_complete` | 🟡 Overengineered for soft launch ES (`producto/01.md § 9` ES default) — EN doesn't hurt but is unvalidated effort | P3 |

## Top 10 problems by sales impact

| # | Problem | Impact | Fix cost |
|---|---|---|---|
| 1 | PDP shipping ETA + cost not visible (H5) | Cold buyer abandons at checkout when shipping "appears". Direct breach of principle § 1. | Medium (1–2 days: hook calling calculator with default postal code + UI in PurchasePanel) |
| 2 | Producer page lacks editorial story (H8) | Without this, marketplace feels "random ecommerce", not curated. The defining differentiator. | Medium-high (template + manual copy for 6 producers; code exists, content doesn't) |
| 3 | Buyer subscriptions UI built and exposed (H17) | Confuses cold buyer ("do I need to subscribe?"); soft signal opposite of "small curated marketplace". | Low (hide routes via existing `feat-buyer-subscriptions=false` flag — verify nav doesn't surface) |
| 4 | Promotions UIs exposed empty (H18) | Without volume there are no promos; empty UI is noise. | Low (hide via flag) |
| 5 | No dedicated shipping/returns pages (H21) | Cold buyer searches for exactly these two links pre-pay. If only in `terminos`, conversion drops. | Low (2 static pages; copy derivable from `business/05.md`) |
| 6 | Guest checkout not advertised (H10) | Works but invisible. Any "iniciar sesión" above the form increases abandonment. | Low (audit `CheckoutPageClient` copy + add "Comprar como invitado" if needed) |
| 7 | Vendor self-signup contradicts curation (H23) | Random producers self-register → curation lost. | Low (gate `/cuenta/hazte-vendedor` or convert to "request invitation") |
| 8 | Apple Pay / Google Pay not confirmed (H12) | On mobile, lifts conversion 10–30%. | Low (verify Stripe Payment Element config) |
| 9 | Possible "Pack" copy without Pack model (H16) | If copy mentions packs but they don't exist as SKU, broken expectation. | Verify before fixing — no exposed copy may exist |
| 10 | No real test shipment performed (E1-03 backlog) | First real order breaks day 1. Operational, not code. | Process, not engineering |

## Top 10 opportunities

| # | Opportunity | Why |
|---|---|---|
| 1 | Reuse the funnel analytics already shipped (H15) | E7-01 is 80% code-done. Missing only: name a PostHog dashboard + schedule weekly review. Zero engineering. |
| 2 | PDP delivery widget with default-peninsula postal code | A single card "Llega en 3-5 días, envío 4,90€ a península" moves the conversion needle. |
| 3 | Honest "Sobre nosotros" footer band | Photo + name of responsible + human email. Zero feature, high trust impact. |
| 4 | Hide unused admin/vendor surfaces behind flags until signal | Reduces support+bug surface without deleting code. Reversible. |
| 5 | Editorial post for 6 producers | Content is what defends "curated". Reuses existing producer page. |
| 6 | Common physical card (E6-04 backlog) | €300 print run. Highest brand lift per euro of the plan. |
| 7 | Post-order NPS survey (E7-02 backlog) | Resend email at +7d. Low effort, high qualitative signal. |
| 8 | Convert `hazte-vendedor` to "request invitation" | Same form, different copy. Preserves curation. |
| 9 | 3 anchor packs (E4-02 backlog) without `Pack` model | V1: sell packs as normal SKU with "incluye X+Y+Z" copy. Defer Pack model until AOV validates. |
| 10 | Hide EN unless Accept-Language explicit | i18n exists; show selector only if browser asks for EN — reduces buyer-ES cognitive load. |

## Features we should NOT build yet

| Feature | Reason |
|---|---|
| `Pack` model in Prisma (E4-01) | V1 with regular SKU + copy is enough. Justify the model only after pack-as-SKU validates AOV. |
| Complex business dashboard (E7-03) | Without orders there's nothing to look at. Living spreadsheet suffices. |
| Centralized logistics (any hint) | `business/05.md` rules it out until 200 orders/week sustained. |
| Buyer subscriptions | `business/04.md § Modelos que NO usamos` says so literally. **Code already exists — hide, don't expand.** |
| Promotions / coupons | Without volume there's no promo to optimize. **Hide.** |
| Multi-currency / multi-country | `business/04.md` rules out. |
| Affiliate program | `business/04.md` rules out. |
| Complex admin analytics dashboard | PostHog is enough. **`admin/analytics` and `admin/informes` are suspect — hide until traffic.** |
| Web push for vendor | Memory `feedback_web_push_unreliable` confirms retirement. |
| Apple OAuth | Memory `social_login_epic_ready` defers. ✅ Already deferred. |
| Any feed / social / follower feature | `business/01.md § Qué NO queremos ser`. |

## Features critical before production

> "Production" = open real traffic (not invite-only links).

1. PDP shows shipping ETA + cost (H5).
2. Producer page with editorial story + producer photo (H8).
3. Dedicated shipping + returns policy pages (H21).
4. Hide subscriptions + promotions from public nav and vendor (H17, H18).
5. CF-1 verified manually on real iPhone + Android end-to-end (E3-01 backlog).
6. Producer notification proven with a real order (E6-01 backlog).
7. Transactional emails actually sending in Resend (E6-03 backlog) — verify `order.confirmed`, `order.shipped`, `order.refunded` exist as templates, not just the client.
8. 6 signed producers + 20–30 SKUs without placeholders + completed test shipment (E1-01/02/03 backlog) — operational, not code.

## Recommended new issues (not already in the launch backlog)

> Format ready for `gh issue create`. Each one is **either** a hide-flag (cheap, reversible) **or** a UI surface fix.

1. `feat(pdp): show shipping ETA + estimated cost above the fold` — H5 / P0. Hook to call `getShippingCost` with default peninsula postal code; UI in `ProductPurchasePanel` above "Añadir al carrito". AC: visible on iPhone SE without scroll.
2. `chore(buyer): hide subscriptions UI behind kill-buyer-subscriptions=true until first 100 orders` — H17 / P0. Gate `vendor/suscripciones`, any `cuenta/suscripciones`, public nav links. Reversible.
3. `chore(promotions): hide vendor+admin promotions UI behind kill-promotions=true until first 100 orders` — H18 / P0.
4. `docs(public): publish dedicated /envios + /devoluciones pages` — H21 / P0. Copy derived from `business/05.md`.
5. `refactor(vendor): convert /hazte-vendedor into invitation request form` — H23 / P1. Same form, status PENDING, email to admin, no auto-approval.
6. `feat(checkout): surface "comprar como invitado" CTA when no session` — H10 / P1.
7. `chore(admin): audit which of the 18 admin sections are actually used pre-launch and gate the rest` — H19 / P1. No deletion; dev-only flag.
8. `docs(audits): file launch-alignment audit (this file) and link from docs/audits/README.md` — meta. Done by the PR landing this file.

## Production risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Cold buyer bounces from PDP not knowing ETA/shipping | High | Conversion drops 30–50% | Issue #1, P0 |
| Producer doesn't receive notification of first order, breaks SLA | Medium | Irrecoverable damage to first customer | E6-01 backlog + real test shipment |
| Traffic lands on empty `vendor/suscripciones` | Low, but embarrassing | Brand | Issue #2 |
| Support spike from "do I need an account?" at checkout | Medium | 1 hour/day for 2 weeks | Issue #6 + E6-05 templates |
| Random vendor signups via `hazte-vendedor` flooding admin | Medium | Distracts team | Issue #5 |
| Bug in one of 18 admin sections blocks a critical one | Low | High if it happens | Issue #7 |
| Stripe webhook + idempotency robust but rest of e-commerce isn't | Low | — | Already well built |
| SW caches stale content in production | Medium | Visual confusion | Verify denylist `/api`, `/admin`, `/checkout` (PWA memory says it's there) |

## Final recommendation

**GO partial: invite-only soft launch. NO-GO for SEO/paid traffic.**

Conditions for upgrade to "full GO":

- ✅ 5 P0s closed: PDP shipping (H5), producer page with story (H8), shipping+returns pages (H21), hide subscriptions (H17), hide promotions (H18).
- ✅ Backlog E1-01 + E1-02 + E1-03 executed (signed producers, published SKUs, real test shipments).
- ✅ E6-01 verified with a real order (not synthetic).
- ✅ CF-1 manually verified on real iPhone + Android (no emulator), with screen recording attached to the "full GO" PR.

**Dominant post-launch risk to monitor**: maintenance curve of already-built code. Each unused admin/vendor section is silent debt. Rule: **a tab unused after 60 days → flag-off, not patch**.

**Most important data point of this audit**: backlog E7-01 lists "instrumentar funnel CF-1 con PostHog" as a Top-5 P0 — and **the code already has 45 analytics call-sites**. The backlog overestimates remaining work. The weekly PostHog review can be scheduled **this week**, not in 2 months.

## Verification commands used

```bash
git rev-parse HEAD                                 # ce8a48b0
ls 'src/app/(public)/'                              # static pages inventory
ls 'src/app/(admin)/admin/' | wc -l                 # 18
ls 'src/app/(vendor)/vendor/'                       # 9 sections incl. suscripciones, promociones
ls 'src/app/(vendor)/vendor/suscripciones/'         # confirmed: [id], nueva, page.tsx, suscriptores
ls 'src/app/(vendor)/vendor/promociones'            # confirmed: [id], nueva, page.tsx
grep -E "model (Pack|Bundle|Combo)" prisma/schema.prisma   # → 0 hits
grep -rn "trackAnalyticsEvent(" src/ | wc -l        # 45
grep -nE "ship|envio|plazo|delivery" src/components/catalog/ProductPurchasePanel.tsx   # → 0
grep -n "auth\|getCurrentUser" src/app/\(buyer\)/checkout/page.tsx   # auth() but doesn't block
ls public/sw* && head scripts/build-sw.mjs          # sw.js generated from sw.template.js
```

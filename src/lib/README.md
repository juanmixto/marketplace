# `src/lib/` — cross-cutting infrastructure only

This directory holds **only cross-cutting infrastructure**: things that don't belong to a single business domain. Domain logic lives next to the rest of its domain under `src/domains/<domain>/`.

If you are about to add a file here, ask:

> Could this live under `src/domains/<some-domain>/` and only that domain would care about it?

If yes, put it there. `src/lib/` is **not** a catch-all.

## What belongs here

- Database client (`db.ts`)
- Environment / config (`env.ts`, `config.ts`, `constants.ts`)
- Auth plumbing (`auth.ts`, `auth-config.ts`, `auth-guard.ts`, `action-session.ts`)
- HTTP helpers (`api-response.ts`)
- Logging, audit, analytics
- Rate limiting, security headers, Prisma error helpers
- Caching primitives (`revalidate.ts`, `cache-tags.ts`)
- Email sending, image validation, generic `utils.ts`
- Site-wide brand/theme (`brand.ts`, `theme.ts`)
- Marketplace-wide settings consumed by every surface (`marketplace-settings.ts`)
- Navigation, role helpers, SEO

## What does NOT belong here

Anything specific to a single domain. See `src/domains/` for the canonical home of:

- `catalog/` — products, search, favorites, demo images, certifications
- `vendors/` — vendor visuals, brand claims
- `orders/` — cart store, checkout
- `auth/` — address defaults
- `reviews/`, `payments/`, `settlements/`, `shipping/`, `admin/`, `finance/`

If a file you need to add is borderline (cross-cutting vs domain), prefer the domain folder and re-export from `lib` only if multiple unrelated domains end up importing it.

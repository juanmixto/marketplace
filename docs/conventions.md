# Project conventions — read before implementing any ticket

> Canonical reference. Linked from `AGENTS.md` / `CLAUDE.md`. If anything here drifts from the code, fix the code OR fix this document — never let them disagree silently.

Last verified against `main`: 2026-04-13.

---

## Stack and exact versions

- **Next.js 16.2.3** — App Router, Server Components by default.
- **React 19.2.4** — only use `'use client'` when strictly needed.
- **TypeScript 5** — strict mode, no `any`.
- **Tailwind CSS v4** — no `tailwind.config.js`; configuration lives in `globals.css`.
- **Prisma 7.7** — generated client at `@/generated/prisma/client` (NOT `@prisma/client`).
- **NextAuth v5 beta.30** — JWT strategy. `auth()` returns the session.
- **Stripe v22** — Connect Express for vendors.
- **Zod v4** — schema validation.

---

## Imports — the ones that bite

```ts
// ✅ Database client
import { db } from '@/lib/db'

// ✅ Auth in Server Components and API routes
import { auth } from '@/lib/auth'

// ✅ Auth in Server Actions ('use server')
import { getActionSession } from '@/lib/action-session'

// ✅ Authorization guards (already implemented)
import { requireAuth, requireVendor, requireAdmin } from '@/lib/auth-guard'

// ✅ Role enum
import { UserRole } from '@/generated/prisma/enums'

// ✅ Role helpers
import { isVendor, isAdmin, hasRole, ADMIN_ROLES } from '@/lib/roles'

// ✅ Cache revalidation
import { safeRevalidatePath } from '@/lib/revalidate'
import { revalidatePath } from 'next/cache'

// ❌ WRONG — these paths do NOT exist
import { prisma } from '@/lib/prisma'   // → use db from @/lib/db
import { auth } from '@/auth'           // → use @/lib/auth
```

---

## Server Action pattern (domain logic)

Server Actions live under `src/domains/<domain>/actions.ts`. Standard shape:

```ts
'use server'

import { db } from '@/lib/db'
import { getActionSession } from '@/lib/action-session'
import { isVendor } from '@/lib/roles'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { safeRevalidatePath } from '@/lib/revalidate'

async function requireVendorSession() {
  const session = await getActionSession()
  if (!session || !isVendor(session.user.role)) redirect('/login')
  const vendor = await db.vendor.findUnique({ where: { userId: session.user.id } })
  if (!vendor) redirect('/login')
  return { session, vendor }
}

export async function myAction(input: unknown) {
  const { vendor } = await requireVendorSession()
  const data = mySchema.parse(input)
  // ... logic
  safeRevalidatePath('/vendor/my-route')
}
```

For API routes and Server Components use the existing `requireVendor()` / `requireAdmin()` from `src/lib/auth-guard.ts` instead of rolling your own.

---

## Prisma model fields — the ones that get misnamed

### User
```prisma
id           String    // cuid
email        String    // unique
passwordHash String?   // ⚠️ NOT "password"
firstName    String
lastName     String
isActive     Boolean   // ⚠️ check before auth
role         UserRole  // CUSTOMER | VENDOR | ADMIN_* | SUPERADMIN
image        String?
```

### Vendor
```prisma
stripeAccountId String?  // nullable until onboarding completes
stripeOnboarded Boolean  // ⚠️ NOT "stripeOnboardingCompleted"
displayName     String   // public producer name
slug            String   // for /productores/[slug] URLs
avgRating       Float?   // updated when Reviews are created
totalReviews    Int      // updated when Reviews are created
```

### Address
```prisma
userId     String
label      String?   // e.g. "Home", "Work"
firstName  String    // ⚠️ no generic "name" field
lastName   String
line1      String    // ⚠️ NOT "calle" / "street"
line2      String?   // floor/door (optional)
city       String
province   String
postalCode String
isDefault  Boolean
```

### Review (ALREADY EXISTS — do not recreate)
```prisma
orderId    String   // part of unique constraint
productId  String   // part of unique constraint
vendorId   String   // ⚠️ required, not optional
customerId String   // FK to User
rating     Int      // 1-5
body       String?  // ⚠️ NOT "comment"
@@unique([orderId, productId])
```

### Settlement
```prisma
vendorId    String
periodFrom  DateTime  // ⚠️ NOT "periodStart"
periodTo    DateTime  // ⚠️ NOT "periodEnd"
grossSales  Decimal   // ⚠️ NOT "grossAmount"
commissions Decimal   // ⚠️ NOT "commissionAmount"
refunds     Decimal
adjustments Decimal
netPayable  Decimal   // ⚠️ NOT "netAmount"
status      SettlementStatus  // DRAFT | PENDING | PROCESSING | PAID | FAILED
paidAt      DateTime?
```

---

## Reviews logic is already implemented

**Do not reimplement.** It lives in `src/domains/reviews/actions.ts`:

- `createReview(orderId, productId, rating, body?)` — creates the review and updates the vendor's `avgRating`.
- `canLeaveReview(orderId, productId)` — checks whether the current user is allowed to review.
- `getProductReviews(productId)` — returns reviews plus aggregate.

What is missing is the **UI** for displaying and creating reviews from product/order pages.

---

## Route middleware — partially wired

`src/lib/auth-config.ts` already implements the `authorized` callback that gates admin/vendor/buyer areas. The only missing piece is the `middleware.ts` file at the project root re-exporting `auth`:

```ts
// middleware.ts (at project root, next to package.json)
export { auth as middleware } from '@/lib/auth'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
```

---

## Update `navigation.ts` when activating routes

`src/lib/navigation.ts` flags some routes as `available: false`. When you implement one of them, flip it to `true` in the same PR — otherwise the entry stays hidden in the header.

---

## Visual identity

- **Primary palette:** emerald / teal.
- **Primary buttons:** `bg-emerald-600 hover:bg-emerald-700 text-white`.
- **Accents:** `text-emerald-600`, `border-emerald-300`.
- **Tailwind v4:** do NOT `@apply` v3-only utilities that no longer exist in v4.

---

## Environment variables

```env
DATABASE_URL           # PostgreSQL connection string
NEXTAUTH_SECRET        # NextAuth secret
NEXTAUTH_URL           # base URL (e.g. http://localhost:3000)
NEXT_PUBLIC_URL        # same as NEXTAUTH_URL but exposed to the client
STRIPE_SECRET_KEY      # sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET  # whsec_...
```

See `.env.example` for the up-to-date list.

---

## Directory layout

```
src/
├── app/
│   ├── (public)/         # Public, no-auth routes
│   ├── (auth)/           # Login, register, password recovery
│   ├── (buyer)/          # Customer routes (CUSTOMER role)
│   ├── (vendor)/         # Producer routes (VENDOR role)
│   ├── (admin)/          # Admin panel
│   └── api/              # API routes
├── components/
│   └── layout/
│       ├── Header.tsx
│       └── Footer.tsx
├── domains/              # Server Actions per business domain
│   ├── vendors/actions.ts
│   ├── orders/actions.ts
│   ├── reviews/actions.ts  # ⚠️ ALREADY EXISTS — do not recreate
│   ├── payments/
│   └── settlements/
├── i18n/                 # See src/i18n/README.md for i18n conventions
├── lib/
│   ├── db.ts              # Prisma client → exports { db }
│   ├── auth.ts            # NextAuth → exports { auth, signIn, signOut }
│   ├── auth-config.ts     # NextAuth config (authorized callback)
│   ├── auth-guard.ts      # requireAuth / requireVendor / requireAdmin
│   ├── action-session.ts  # getActionSession() for Server Actions
│   ├── roles.ts           # isVendor / isAdmin / ADMIN_ROLES
│   └── navigation.ts      # navigation config — flip available when implementing routes
└── generated/
    └── prisma/            # Generated Prisma client (do NOT import @prisma/client)
```

---

## Related documents

- [`src/i18n/README.md`](../src/i18n/README.md) — i18n conventions (flat keys vs `*-copy.ts` vs `labelKey`).

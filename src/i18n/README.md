# i18n conventions

This module hosts the two complementary internationalization mechanisms used in this repo. New code MUST pick the right one according to the rules below. When in doubt, lean on the examples and copy the closest existing pattern.

> Status: canonical convention as of issue #233. If you are adding a new content surface and neither option below fits, open an issue before inventing a third mechanism.

---

## TL;DR

| You are translating…                                               | Use                                  |
| ------------------------------------------------------------------ | ------------------------------------ |
| Short strings, labels, buttons, toasts, error messages             | **Flat keys** in `locales/{es,en}.ts` |
| Static page content with headings + paragraphs + lists             | **`*-copy.ts`** module                |
| Server-side dictionary that maps to user-facing text               | **`labelKey` pattern** (see below)    |

---

## 1. Flat keys — `locales/{es,en}.ts`

Use this for any short, reusable string. Consume with `useT()` on the client or `getServerT()` on the server.

```ts
// client
import { useT } from '@/i18n'
const t = useT()
return <button>{t('producersPage.viewProducer')}</button>

// server component / server action
import { getServerT } from '@/i18n/server'
const t = await getServerT()
return <h1>{t('account.greeting')}</h1>
```

Pick this when **all** of the following are true:

- The string is roughly ≤ 10 words (a label, a button, a toast, an error message).
- It is, or could be, reused in more than one place — or it is a generic UI affordance.
- It does not need nested structure (no headings + paragraphs + lists).

Adding a new key:

1. Add the key to **both** `src/i18n/locales/es.ts` and `src/i18n/locales/en.ts`.
2. The `i18n-parity` test (`test/i18n-parity.test.ts`) enforces both files stay in sync — if you forget a locale, CI will tell you.
3. Use a dotted namespace (`feature.subgroup.key`) so related strings cluster.

---

## 2. `*-copy.ts` modules

Use this for static page content where strings are paragraphs, lists, or otherwise structured. Each module exports a typed object keyed by `Locale` and a tiny helper that returns the right slice for the active locale.

Existing examples — copy whichever is closest to what you need:

- [`catalog-copy.ts`](./catalog-copy.ts) — product catalog content fragments.
- [`legal-page-copy.ts`](./legal-page-copy.ts) — privacy / cookies / terms / legal notice pages, consumed from `src/app/(public)/{aviso-legal,cookies,privacidad,terminos}/page.tsx`.
- [`public-page-copy.ts`](./public-page-copy.ts) — contact / about / FAQ style public pages.

Pick this when **any** of the following are true:

- The content is a static page (legal, about, landing, FAQ).
- It has sections with headings + paragraphs + lists nested inside.
- It is rendered exactly once, in a specific route.
- A flat key would force you to either (a) explode it into dozens of micro-keys that only ever appear together, or (b) embed HTML in a string.

Conventions for new `*-copy.ts` modules:

1. File name: `<surface>-copy.ts` (e.g. `landing-copy.ts`, not `landingTexts.ts`).
2. Export a typed object: `export const fooCopy: Record<Locale, FooCopy> = { es: {...}, en: {...} }`.
3. Export a helper: `export function getFooCopy(locale: Locale): FooCopy { return fooCopy[locale] ?? fooCopy[defaultLocale] }`.
4. Resolve the locale once at the top of the page server component via `getServerLocale()` and pass the resolved object down as a plain prop. Do **not** import `*-copy.ts` modules from client components — keep the bundle lean.
5. Add a header comment linking back to this README so the next reader knows the convention.

---

## 3. The `labelKey` pattern

Server-side helpers sometimes generate "dictionary" data (badges, vendor visuals, status chips) that is later rendered as text. **Do not return the resolved string from the helper.** Return an i18n **key** instead, and resolve it in the component with `t(...)`.

Reference implementation: [`src/domains/vendors/visuals.ts`](../domains/vendors/visuals.ts) (see the `labelKey` field, established in PR #228).

Why:

- The helper stays pure and locale-agnostic — same data on every request, easy to cache.
- Locale switching does not require re-running the helper.
- The contract test in `test/i18n-no-hardcoded-literals.test.ts` cannot complain about strings that never exist.

Apply this pattern any time you find yourself writing `if (locale === 'es') return 'Texto'` inside `src/lib/**`, `src/domains/**`, or any server-only helper.

---

## 4. Adding a new locale

Checklist when adding a third locale (e.g. `ca`, `pt`):

1. Extend the `Locale` union and `locales` map in `src/i18n/locales/index.ts`.
2. Create `src/i18n/locales/<new-locale>.ts` with **all** keys from `es.ts` (parity is enforced by `test/i18n-parity.test.ts`).
3. Add a `<new-locale>` slot to **every** `*-copy.ts` module. TypeScript will fail the build until you do — that is intentional.
4. Update `LOCALE_COOKIE_KEYS` consumers in `src/i18n/server.ts` and `src/i18n/index.tsx` only if the cookie format itself changes (it usually doesn't).
5. Run `npm test -- test/i18n-parity.test.ts` and `npm test -- test/i18n-no-hardcoded-literals.test.ts`.

---

## 5. Request → render flow

```
   incoming request
        │
        ▼
 ┌──────────────────┐
 │ getServerLocale  │  ← reads `mp_locale` / `locale` cookie
 └────────┬─────────┘
          │ Locale
          ▼
 ┌────────────────────────────────────┐
 │ server component / server action   │
 │  • getServerT()  → flat keys       │
 │  • getFooCopy(locale) → *-copy.ts  │
 └────────┬───────────────────────────┘
          │ resolved strings / copy object
          ▼
 ┌────────────────────────────────────┐
 │ client component                   │
 │  • useT() for flat keys            │
 │  • receives copy as plain prop     │
 └────────────────────────────────────┘
```

The client `LanguageProvider` (in [`index.tsx`](./index.tsx)) keeps the user's choice in `localStorage` + cookie so the next server request picks it up via `getServerLocale()`.

---

## 6. Enforcement

- **Parity:** `test/i18n-parity.test.ts` — every key must exist in every locale file.
- **No hardcoded literals:** `test/i18n-no-hardcoded-literals.test.ts` — fails CI if visible strings appear inline in `src/app/**`. The error message points back here.

If you are tempted to disable either test, open an issue first.

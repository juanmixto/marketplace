import { z } from 'zod'
import { slugify } from '@/lib/utils'

/**
 * Reusable zod primitives for the marketplace's input contracts. The aim is
 * one place where the rules live so a tightening (e.g. `.max(254)` on email,
 * the IDN normalization we don't have yet) lands in every consumer at once.
 *
 * Use these instead of inlining `z.string().email()` etc. in route handlers
 * and server actions. See docs/audits/README.md for the audit trail and
 * issue #1160 for the rollout epic.
 */

/**
 * RFC-bounded email length (254). We trim + lowercase here so the schema
 * itself is the canonical normalizer; downstream code can drop ad-hoc
 * `.trim().toLowerCase()` calls.
 *
 * Pairs with normalizeAuthEmail() in src/lib/auth-email.ts: any auth-related
 * lookup or insert MUST normalize before hitting the DB (User.email is
 * `@unique` but not `citext`).
 */
export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email inválido')
  .max(254, 'Email demasiado largo')

/**
 * Prisma cuid surface. Validates length + lowercase alphanum so a malformed
 * path param fails fast at the route boundary instead of escaping to a
 * Prisma 500 / sneakily widening the timing-attack channel via 404 latency.
 */
export const zCuid = z.string().regex(/^c[a-z0-9]{20,}$/, 'identificador inválido')

/**
 * Slug input that ALWAYS re-runs `slugify()` so the persisted value is
 * canonical regardless of what the client sent. Diacritics, casing, spaces
 * are normalized; if the result is empty (input was all punctuation) we
 * reject explicitly rather than persisting an empty string.
 */
export const zSlug = z
  .string()
  .trim()
  .min(2, 'Slug demasiado corto')
  .max(100, 'Slug demasiado largo')
  .transform(slugify)
  .refine((s) => s.length >= 2, 'Slug vacío tras normalizar')

/**
 * Money in EUR, persisted as Prisma `Decimal(10,2)` (see
 * docs/db-conventions.md). Accepts strings (FormData ships strings) with
 * Spanish-style comma decimals; rejects NaN / Infinity / negative; caps at
 * 100 000 EUR (well above any single product or shipping rate today —
 * tighter caps belong on the per-field schema).
 *
 * Use this instead of `z.coerce.number().positive()` so:
 *   1. NaN can never slip through (`z.coerce` accepts it, this preprocess
 *      rejects via `.finite()`).
 *   2. `Number()` and `parseFloat()` calls disappear from server actions —
 *      let the schema do the coercion.
 */
export const zMoneyEUR = z.preprocess(
  (v) => {
    if (typeof v === 'string') {
      const trimmed = v.trim()
      if (trimmed === '') return undefined
      return Number.parseFloat(trimmed.replace(',', '.'))
    }
    return v
  },
  z
    .number()
    .finite('Importe inválido')
    .nonnegative('Importe debe ser >= 0')
    .max(100_000, 'Importe demasiado alto')
    .refine((n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Máximo 2 decimales')
)

/**
 * Spanish/E164-friendly phone validation. Strips formatting characters
 * (`( ) - .` + spaces) and validates 9-15 digits with optional leading `+`.
 * Replaces the scattered `isPlausiblePhone` / `normalizePhone` pair: this
 * one returns the normalized form, so `Address.phone` etc. land in the DB
 * in a stable shape.
 */
export const zPhoneES = z
  .string()
  .trim()
  .min(9, 'Teléfono demasiado corto')
  .max(20, 'Teléfono demasiado largo')
  .transform((s) => s.replace(/[\s().\-]/g, ''))
  .refine((s) => /^\+?\d{9,15}$/.test(s), 'Teléfono inválido')

/**
 * Plain-text input that explicitly rejects HTML markers (`<`, `>`, named
 * entities). Use this for fields that the UI renders as text content
 * (banners, descriptions, notes) so a future PR that introduces
 * `dangerouslySetInnerHTML` or markdown rendering doesn't silently turn the
 * field into an XSS vector.
 *
 * For fields that intentionally accept formatting (rich-text editor) build
 * a separate primitive backed by DOMPurify; not provided here because no
 * such field exists in the codebase today.
 */
export const zSafeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .refine((s) => !/[<>]/.test(s), 'No se permiten caracteres `<` o `>`')
    .refine((s) => !/&[a-z][a-z0-9]*;/i.test(s), 'No se permiten entidades HTML')

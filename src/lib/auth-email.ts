/**
 * Canonical email normalization for the auth subsystem.
 *
 * `User.email` is `@unique` but NOT citext, so two rows with `Juan@x.com`
 * and `juan@x.com` would coexist. Every code path that looks up or
 * creates an auth-relevant `User` row MUST run the email through this
 * helper first. Today: credentials authorize, register, the OAuth
 * `signIn` callback (#850), and the link-token issuer (#854-lite).
 *
 * Edge-safe: pure string ops, no Node primitives.
 */
export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Maps the `name` field that OAuth providers (Google) emit into our
 * `User.firstName` + `User.lastName` columns. Schema requires both to
 * be non-null strings; the OAuth profile only ships a single `name`.
 *
 * Behaviour:
 *   - "Juan Ortega"          → firstName="Juan",  lastName="Ortega"
 *   - "Juan María Ortega"    → firstName="Juan",  lastName="María Ortega"
 *   - "Juan"                 → firstName="Juan",  lastName=""
 *   - "" / null + email      → firstName from email local-part,  lastName=""
 *   - "" / null + no email   → firstName="User", lastName=""
 *
 * Edge-safe (pure string ops).
 */
export function splitProfileName(
  name?: string | null,
  email?: string | null
): { firstName: string; lastName: string } {
  const tokens = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length > 0) {
    return {
      firstName: tokens[0]!,
      lastName: tokens.slice(1).join(' '),
    }
  }
  const localPart = email?.split('@')[0]?.trim() ?? ''
  return {
    firstName: localPart || 'User',
    lastName: '',
  }
}

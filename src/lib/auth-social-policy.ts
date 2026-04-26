/**
 * Pure decision function that implements the email-collision matrix
 * signed in `docs/auth/audit.md` §4. The OAuth `signIn` callback in
 * `src/lib/auth.ts` is a thin wrapper around this; this module stays
 * Prisma-free and edge-safe so it can be unit-tested without a DB.
 *
 * Inputs are passed in (no `import { db }` here): the caller resolves
 * the `existingUser` lookup against whatever data source it wants.
 */

export type SocialPolicyDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: 'kill_switch' }
  | { kind: 'deny'; reason: 'provider_account_mismatch' }
  | {
      kind: 'redirect_link'
      reason: 'credentials_collision' | 'unverified_credentials_collision'
      email: string
      provider: string
      providerAccountId: string
    }

export interface SocialPolicyInput {
  /** Whether the global `kill-auth-social` switch is engaged. */
  killSwitchEngaged: boolean
  /** The OAuth provider id (e.g. 'google'). */
  provider: string
  /** Stable provider-side account id (sub). */
  providerAccountId: string
  /** Email returned by the provider, already normalized
   *  (`normalizeAuthEmail`). May be an Apple privaterelay address. */
  email: string
  /** Whether the provider asserts the email is verified. Treated as
   *  `true` for Google and Apple at the call site. */
  emailVerified: boolean
  /** Result of looking up `User` by normalized email + their existing
   *  `Account` rows. `null` if no User exists. */
  existingUser: {
    id: string
    hasPasswordHash: boolean
    emailVerifiedAt: Date | null
    accounts: Array<{ provider: string; providerAccountId: string }>
  } | null
}

/**
 * Deciding the fate of an OAuth signIn attempt. Returns one of:
 *   - allow: no collision, NextAuth proceeds (creates User+Account on
 *     first use, reuses Account on subsequent signins).
 *   - deny(kill_switch): emergency switch is on; reject all OAuth.
 *   - deny(provider_account_mismatch): same email + same provider but
 *     different sub. Refuses to silently overwrite the link; user must
 *     contact support. Audit doc matrix case C.
 *   - redirect_link(credentials_collision): User has a passwordHash
 *     but no Account row for this provider. Phase 5 handles the
 *     password gate. Matrix case D.
 *   - redirect_link(unverified_credentials_collision): User exists but
 *     never verified their email; treated like case D for safety even
 *     though they may not remember a password. Matrix case F variant.
 *
 * Note: matrix case E (User has another social account but no
 * passwordHash, attempting a 3rd-party link) is intentionally NOT
 * implemented in MVP — there are no solo-social users until Google
 * ships. When it lands, add a new branch returning `redirect_link`
 * with `reason: 'social_collision'` and a different gate (email
 * confirm, not password).
 */
export function decideSocialSignIn(input: SocialPolicyInput): SocialPolicyDecision {
  if (input.killSwitchEngaged) return { kind: 'deny', reason: 'kill_switch' }

  const { existingUser, provider, providerAccountId, email } = input

  // Case A: no existing User. Auth.js PrismaAdapter creates it.
  if (!existingUser) return { kind: 'allow' }

  // Case B / C: provider is already linked.
  const sameProviderLink = existingUser.accounts.find(a => a.provider === provider)
  if (sameProviderLink) {
    if (sameProviderLink.providerAccountId === providerAccountId) {
      // Case B: returning user, same sub.
      return { kind: 'allow' }
    }
    // Case C: same email + same provider but different sub. Patho-
    // logical — refuse to silently rewrite.
    return { kind: 'deny', reason: 'provider_account_mismatch' }
  }

  // Case D: credentials user (has passwordHash) tries to add OAuth.
  // Password gate at /login/link.
  if (existingUser.hasPasswordHash) {
    return {
      kind: 'redirect_link',
      reason: 'credentials_collision',
      email,
      provider,
      providerAccountId,
    }
  }

  // Case F: user exists with no passwordHash AND no matching Account.
  // Most plausible: a stale registration that never verified email,
  // OR the deferred case E (other social provider). MVP collapses
  // both to a redirect_link with a flag the link page can use to
  // pick the right gate when Phase 5 lands. Until then, surface as a
  // distinct reason so the login page can show a helpful message
  // instead of silently linking.
  return {
    kind: 'redirect_link',
    reason: 'unverified_credentials_collision',
    email,
    provider,
    providerAccountId,
  }
}

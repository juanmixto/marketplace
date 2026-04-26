import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { sanitizeCallbackUrl, STOREFRONT_PATH } from '@/lib/portals'
import { OnboardingForm } from '@/components/auth/OnboardingForm'

interface Props {
  searchParams: Promise<{ next?: string }>
}

// Force-dynamic so the auth() lookup runs per-request and the proxy
// gate decision isn't cached.
export const dynamic = 'force-dynamic'

/**
 * Lightweight onboarding screen for users created via OAuth (Phase 2
 * #855). The proxy redirects here when the JWT claim
 * `needsOnboarding` is true — set by the OAuth jwt callback when an
 * account has no passwordHash AND no consentAcceptedAt.
 *
 * Single legal-consent checkbox: GDPR requires explicit, separable,
 * unambiguous consent. We do NOT bundle the checkbox into a third-
 * party signin button — that would not pass an audit. Once consent
 * lands, the action calls `unstable_update` to flip the JWT claim
 * and redirects to the safe `next` URL.
 */
export default async function OnboardingPage({ searchParams }: Props) {
  const { next } = await searchParams
  const session = await auth()

  if (!session?.user?.id) {
    // Not logged in: send to /login with this page as the callback so
    // the user lands back here once they authenticate.
    const target = next ? `/onboarding?next=${encodeURIComponent(next)}` : '/onboarding'
    redirect(`/login?callbackUrl=${encodeURIComponent(target)}`)
  }

  // Defensive: confirm DB state matches the JWT claim. If
  // consentAcceptedAt is set, the proxy redirected here in error
  // (e.g. stale JWT after a partial update). Skip the form.
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, consentAcceptedAt: true, passwordHash: true },
  })
  if (!user) redirect('/login')

  const safeNext = sanitizeCallbackUrl(next) ?? STOREFRONT_PATH
  if (user.consentAcceptedAt) redirect(safeNext)

  return (
    <div className="container mx-auto py-10 px-4 max-w-md">
      <OnboardingForm
        firstName={user.firstName}
        next={safeNext}
      />
    </div>
  )
}

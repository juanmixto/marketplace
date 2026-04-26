'use server'

import { redirect } from 'next/navigation'
import { auth, unstable_update } from '@/lib/auth'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { sanitizeCallbackUrl, STOREFRONT_PATH } from '@/lib/portals'

export type OnboardingActionResult =
  | { ok: false; reason: 'unauthenticated' | 'consent_required' | 'generic' }

/**
 * Server action that finalises onboarding. Idempotent — if
 * consentAcceptedAt is already set, it just refreshes the JWT and
 * redirects. Validates that the consent checkbox was checked (GDPR
 * requires explicit acceptance).
 */
export async function completeOnboardingAction(
  formData: FormData
): Promise<OnboardingActionResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return { ok: false, reason: 'unauthenticated' }
  }

  const consent = formData.get('consent')
  if (consent !== 'on' && consent !== 'true') {
    return { ok: false, reason: 'consent_required' }
  }

  const next = String(formData.get('next') ?? '')
  const safeNext = sanitizeCallbackUrl(next) ?? STOREFRONT_PATH

  try {
    await db.user.update({
      where: { id: session.user.id },
      data: { consentAcceptedAt: new Date() },
    })
    logger.info('auth.onboarding.completed', { userId: session.user.id })
  } catch (err) {
    logger.error('auth.onboarding.update_failed', {
      userId: session.user.id,
      err,
    })
    return { ok: false, reason: 'generic' }
  }

  // Refresh the JWT so the proxy sees needsOnboarding=false on the
  // next request. unstable_update triggers the jwt() callback with
  // trigger='update' which runs the DB lookup in src/lib/auth.ts.
  await unstable_update({})

  redirect(safeNext)
}

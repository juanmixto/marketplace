'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  LAST_PORTAL_COOKIE,
  LAST_PORTAL_MAX_AGE_SECONDS,
  isValidPortalMode,
  getAvailablePortals,
  type LoginPortalMode,
} from '@/lib/portals'
import { getActionSession } from '@/lib/action-session'

/**
 * Switch the active portal. Sets the `mp_last_portal` cookie and redirects
 * to the target portal's home. Validates that the caller actually has
 * access to the requested portal — an attempt to switch to `admin` by a
 * non-admin is rejected as a no-op.
 *
 * Called from the `PortalSwitcher` client component via a form action,
 * which is the only way to mutate cookies from user-initiated UI in the
 * current Next.js architecture.
 */
export async function switchPortal(formData: FormData): Promise<void> {
  const rawTarget = formData.get('target')
  if (typeof rawTarget !== 'string' || !isValidPortalMode(rawTarget)) {
    // Silently ignore invalid input — never trust form data.
    return
  }
  const target: LoginPortalMode = rawTarget

  const session = await getActionSession()
  if (!session) redirect('/login')

  const available = getAvailablePortals(session.user.role)
  const match = available.find(p => p.mode === target)
  if (!match) {
    // Caller asked for a portal they don't have access to — redirect them
    // to their current landing area instead of honoring the request.
    redirect(available[0]?.href ?? '/')
  }

  const cookieStore = await cookies()
  cookieStore.set(LAST_PORTAL_COOKIE, target, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LAST_PORTAL_MAX_AGE_SECONDS,
  })

  redirect(match.href)
}

import { LoginForm } from '@/components/auth/LoginForm'
import { SocialButtons } from '@/components/auth/SocialButtons'
import { AuthErrorBanner } from '@/components/auth/AuthErrorBanner'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  resolvePostLoginDestination,
  describeCallbackRejection,
  isValidPortalMode,
  LAST_PORTAL_COOKIE,
} from '@/lib/portals'
import { isKnownAuthError } from '@/lib/auth-error-codes'
import { logger } from '@/lib/logger'

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const session = await auth()

  if (params.callbackUrl) {
    const rejection = describeCallbackRejection(params.callbackUrl)
    if (rejection && rejection !== 'empty') {
      logger.warn('auth.callback.rejected', {
        reason: rejection,
        // Log only length, not the raw URL, to avoid capturing attacker payloads.
        callbackLength: params.callbackUrl.length,
      })
    }
  }

  if (session?.user) {
    const cookieStore = await cookies()
    const rawLastPortal = cookieStore.get(LAST_PORTAL_COOKIE)?.value
    const lastPortal = isValidPortalMode(rawLastPortal) ? rawLastPortal : null

    redirect(
      resolvePostLoginDestination(session.user.role, params.callbackUrl, {
        lastPortal,
        onRoleMismatch: ({ callbackMode, roleMode }) => {
          logger.warn('auth.callback.rejected', {
            reason: 'role_mismatch',
            userId: session.user?.id,
            role: session.user?.role,
            callbackMode,
            roleMode,
          })
        },
      })
    )
  }

  // Surface OAuth/auth.js error codes to the user. Log unknown codes
  // so we notice when a new one appears upstream and lacks a copy.
  if (params.error && !isKnownAuthError(params.error)) {
    logger.warn('auth.error.unknown_code', { code: params.error })
  }

  const callbackUrl = params.callbackUrl ?? '/'
  return (
    <>
      <AuthErrorBanner errorCode={params.error} />
      <LoginForm
        callbackUrl={callbackUrl}
        topSlot={<SocialButtons callbackUrl={callbackUrl} />}
      />
    </>
  )
}

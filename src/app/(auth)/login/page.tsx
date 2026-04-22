import { LoginForm } from '@/components/auth/LoginForm'
import { auth } from '@/lib/auth'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  resolvePostLoginDestination,
  describeCallbackRejection,
  isValidPortalMode,
  LAST_PORTAL_COOKIE,
} from '@/lib/portals'
import { logger } from '@/lib/logger'

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams
  const session = await auth()
  const initialError =
    params.error === 'CredentialsSignin'
      ? 'Email o contraseña incorrectos'
      : null

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

  return <LoginForm callbackUrl={params.callbackUrl ?? '/'} initialError={initialError} />
}

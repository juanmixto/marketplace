import { getServerT } from '@/i18n/server'
import { mapAuthErrorCode } from '@/lib/auth-error-codes'

interface Props {
  errorCode?: string
}

/**
 * Renders a localized error banner above the login form when the URL
 * carries an `?error=...` from a failed OAuth callback or our own
 * link / kill-switch redirects. Server component — error → key
 * mapping is centralized in `auth-error-codes.ts` so the same logic
 * applies to any future caller (admin/security/enroll, etc.).
 */
export async function AuthErrorBanner({ errorCode }: Props) {
  const key = mapAuthErrorCode(errorCode)
  if (!key) return null
  const t = await getServerT()
  return (
    <div
      role="alert"
      className="mx-auto mb-6 max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/35 dark:text-red-300"
    >
      {t(key)}
    </div>
  )
}

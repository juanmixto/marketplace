import { redirect } from 'next/navigation'
import { AuthLinkForm } from '@/components/auth/AuthLinkForm'
import { verifyAuthLinkToken, AuthLinkTokenError } from '@/lib/auth-link-token'
import { logger } from '@/lib/logger'

interface Props {
  searchParams: Promise<{ token?: string }>
}

// Force-dynamic so the token query param isn't cached. The token is
// short-lived (5 min) and its presence in the URL is part of the
// flow — we never want a CDN to serve a stale page that might
// surface a stale token to a different user.
export const dynamic = 'force-dynamic'

export default async function LoginLinkPage({ searchParams }: Props) {
  const { token } = await searchParams
  if (!token) redirect('/login')

  const secret = process.env.AUTH_SECRET
  if (!secret) {
    logger.error('auth.link.page_missing_secret')
    redirect('/login?error=link_unavailable')
  }

  let payload
  try {
    payload = await verifyAuthLinkToken(token, secret)
  } catch (err) {
    if (err instanceof AuthLinkTokenError && err.code === 'expired') {
      redirect('/login?error=link_expired')
    }
    logger.warn('auth.link.page_invalid_token', {
      code: err instanceof AuthLinkTokenError ? err.code : 'unknown',
    })
    redirect('/login?error=link_invalid')
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <AuthLinkForm
        token={token}
        email={payload.email}
        provider={payload.provider}
      />
    </div>
  )
}

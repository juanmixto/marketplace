import { notFound } from 'next/navigation'
import { isMockOAuthEnabled } from '@/lib/auth-mock-oauth'
import { OAuthTriggerButton } from './OAuthTriggerButton'

/**
 * Test-only page that exposes a button to start the mock-oauth flow
 * via `next-auth/react`'s `signIn()`. Required because Auth.js v5
 * routes /api/auth/signin/<provider> through our `pages.signIn` (=
 * /login) which has no mock button by design — we don't want a
 * mock-oauth call site shipping in the production bundle. This page
 * 404s outside the mock test gate.
 */
interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

export const dynamic = 'force-dynamic'

export default async function OAuthTriggerPage({ searchParams }: Props) {
  // Defense in depth: src/proxy.ts 404s /dev/* in production via
  // isDevRoute(). This inline check is the audit-mandated belt-and-
  // suspenders gate (test/integration/dev-routes-audit.test.ts).
  if (process.env.NODE_ENV === 'production') notFound()
  if (!isMockOAuthEnabled()) notFound()
  const { callbackUrl = '/' } = await searchParams
  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-xl font-bold mb-4">Mock OAuth trigger (test only)</h1>
      <p className="text-sm text-slate-500 mb-4">
        callbackUrl: <code>{callbackUrl}</code>
      </p>
      <OAuthTriggerButton callbackUrl={callbackUrl} />
    </div>
  )
}

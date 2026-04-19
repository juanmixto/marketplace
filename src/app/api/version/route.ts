import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Reports the running build identity. Powers <UpdateAvailableBanner />:
 * the client captures the SHA on first load, polls this endpoint every
 * minute, and prompts the user to reload when the SHA returned here
 * differs from what it captured. Also useful for ops health checks
 * ("which version is prod actually serving?") and bug reports.
 *
 * Public on purpose: the SHA + build time + branch tell anyone the
 * deploy state, which is the same information already visible in
 * <BuildBadge />. No secrets, no PII.
 */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      sha: process.env.NEXT_PUBLIC_COMMIT_SHA ?? 'unknown',
      buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
      branch: process.env.NEXT_PUBLIC_GIT_BRANCH ?? 'unknown',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  )
}

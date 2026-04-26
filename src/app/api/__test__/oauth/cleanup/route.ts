import { db } from '@/lib/db'
import { isMockOAuthEnabled, MOCK_OAUTH_PROVIDER_ID } from '@/lib/auth-mock-oauth'
import { clearMockStore } from '@/lib/auth-mock-oauth-store'

/**
 * Test-only cleanup: deletes every Account row whose provider is the
 * mock OAuth provider, plus every User created exclusively through
 * that provider (no passwordHash, no other Account). Runs at the
 * start of each spec so test ordering is irrelevant. 404 in
 * production.
 */
export async function POST() {
  if (!isMockOAuthEnabled()) {
    return new Response(null, { status: 404 })
  }

  // 1. Snapshot mock-oauth User ids before we delete the Account rows.
  const mockAccounts = await db.account.findMany({
    where: { provider: MOCK_OAUTH_PROVIDER_ID },
    select: { userId: true },
  })
  const userIds = mockAccounts.map(a => a.userId)

  // 2. Delete the Account rows.
  await db.account.deleteMany({ where: { provider: MOCK_OAUTH_PROVIDER_ID } })

  // 3. Delete users that only existed because of mock-oauth: no
  //    passwordHash AND no remaining Account rows. Anything else (like
  //    the seeded cliente@test.com that just had a mock Account
  //    linked) survives.
  if (userIds.length > 0) {
    await db.user.deleteMany({
      where: {
        id: { in: userIds },
        passwordHash: null,
        accounts: { none: {} },
      },
    })
  }

  // 4. Reset the in-memory authorize-code store so a fresh test starts
  //    with no leftover codes.
  clearMockStore()

  return Response.json({ ok: true, removed: userIds.length })
}

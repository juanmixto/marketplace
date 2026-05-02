import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Regression test for the 2026-05-02 login UX bug: an admin who lands
 * on /login directly (no ?callbackUrl=/admin) used to skip the
 * login-precheck call and go straight to NextAuth's signIn. Because
 * authorize() rejects credentials when 2FA is required and no TOTP
 * was sent, the user saw a generic "invalid credentials" error and
 * had no way to provide their TOTP code.
 *
 * The fix: always call login-precheck. This contract pins the change
 * so a future "optimization" doesn't reintroduce the asymmetry.
 */

function read(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), 'utf8')
}

test('LoginForm always runs the precheck, regardless of portal mode', () => {
  const src = read('src/components/auth/LoginForm.tsx')

  // The precheck endpoint must be called from the credentials submit
  // handler. This is the load-bearing assertion.
  assert.match(
    src,
    /handleCredentialsSubmit[\s\S]*?fetch\(['"]\/api\/auth\/login-precheck['"]/,
    'handleCredentialsSubmit must POST to /api/auth/login-precheck',
  )

  // Pin: the old short-circuit `if (!isAdminPortal) { ... return }`
  // must NOT come back inside the credentials handler. We assert a
  // *negative* match against the specific shape of the bypass.
  assert.doesNotMatch(
    src,
    /if\s*\(\s*!\s*isAdminPortal\s*\)\s*\{[\s\S]{0,200}completeSignIn/,
    'handleCredentialsSubmit must not skip the precheck for non-admin portals — see 2026-05-02 incident',
  )
})

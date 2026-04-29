import test from 'node:test'
import assert from 'node:assert/strict'
import { isMockOAuthEnabled } from '@/lib/auth-mock-oauth'

test('isMockOAuthEnabled requires both flags set to "1"', () => {
  assert.equal(
    isMockOAuthEnabled({ MOCK_OAUTH_ENABLED: '1', PLAYWRIGHT_E2E_PROD_OAUTH: '1' }),
    true,
  )
})

test('isMockOAuthEnabled is false when either flag is missing', () => {
  assert.equal(isMockOAuthEnabled({}), false)
  assert.equal(isMockOAuthEnabled({ MOCK_OAUTH_ENABLED: '1' }), false)
  assert.equal(isMockOAuthEnabled({ PLAYWRIGHT_E2E_PROD_OAUTH: '1' }), false)
})

test('isMockOAuthEnabled is false for any non-"1" truthy value', () => {
  assert.equal(
    isMockOAuthEnabled({ MOCK_OAUTH_ENABLED: 'true', PLAYWRIGHT_E2E_PROD_OAUTH: '1' }),
    false,
  )
  assert.equal(
    isMockOAuthEnabled({ MOCK_OAUTH_ENABLED: '1', PLAYWRIGHT_E2E_PROD_OAUTH: 'true' }),
    false,
  )
})

test('isMockOAuthEnabled stays true under NODE_ENV=production (the #985 regression)', () => {
  // The previous gate used `NODE_ENV !== 'production'` which silently
  // disabled mock-OAuth in Nightly because `next start` forces
  // NODE_ENV=production. The fix decouples the gate from NODE_ENV;
  // this test pins that.
  assert.equal(
    isMockOAuthEnabled({
      MOCK_OAUTH_ENABLED: '1',
      PLAYWRIGHT_E2E_PROD_OAUTH: '1',
      NODE_ENV: 'production',
    }),
    true,
  )
})

test('isMockOAuthEnabled is false when only MOCK_OAUTH_ENABLED leaks to a real prod deploy', () => {
  // Defense-in-depth contract: a single accidental leak of
  // MOCK_OAUTH_ENABLED=1 into a real prod deploy must NOT enable the
  // mock provider, because nothing in the deploy pipeline ever sets
  // PLAYWRIGHT_E2E_PROD_OAUTH.
  assert.equal(
    isMockOAuthEnabled({ MOCK_OAUTH_ENABLED: '1', NODE_ENV: 'production' }),
    false,
  )
})

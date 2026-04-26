import test from 'node:test'
import assert from 'node:assert/strict'
import { mapAuthErrorCode, isKnownAuthError } from '@/lib/auth-error-codes'

test('mapAuthErrorCode: known Auth.js codes map to specific keys', () => {
  assert.equal(mapAuthErrorCode('AccessDenied'), 'login.error.oauth.accessDenied')
  assert.equal(mapAuthErrorCode('OAuthSignin'), 'login.error.oauth.signin')
  assert.equal(mapAuthErrorCode('OAuthCallback'), 'login.error.oauth.callback')
  assert.equal(mapAuthErrorCode('OAuthAccountNotLinked'), 'login.error.oauth.notLinked')
  assert.equal(mapAuthErrorCode('Configuration'), 'login.error.oauth.configuration')
})

test('mapAuthErrorCode: our own codes (link_*, disabled) map correctly', () => {
  assert.equal(mapAuthErrorCode('link_invalid'), 'login.link.error.invalidToken')
  assert.equal(mapAuthErrorCode('link_expired'), 'login.link.error.expired')
  assert.equal(mapAuthErrorCode('link_unavailable'), 'login.error.generic')
  assert.equal(mapAuthErrorCode('disabled'), 'login.error.oauth.disabled')
})

test('mapAuthErrorCode: unknown codes fall back to generic', () => {
  assert.equal(mapAuthErrorCode('SomeNewCode'), 'login.error.oauth.generic')
  assert.equal(mapAuthErrorCode('foobar'), 'login.error.oauth.generic')
})

test('mapAuthErrorCode: empty / undefined returns null (no banner)', () => {
  assert.equal(mapAuthErrorCode(undefined), null)
  assert.equal(mapAuthErrorCode(''), null)
})

test('isKnownAuthError: matches the catalogue', () => {
  assert.equal(isKnownAuthError('AccessDenied'), true)
  assert.equal(isKnownAuthError('link_invalid'), true)
  assert.equal(isKnownAuthError('SomeNewCode'), false)
  assert.equal(isKnownAuthError(undefined), false)
})

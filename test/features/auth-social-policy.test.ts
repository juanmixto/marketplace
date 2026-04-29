import test from 'node:test'
import assert from 'node:assert/strict'
import { decideSocialSignIn } from '@/lib/auth-social-policy'

const baseInput = {
  killSwitchEngaged: false,
  provider: 'google',
  providerAccountId: 'sub_123',
  email: 'juan@x.com',
  emailVerified: true,
}

test('case A: no existing user → allow (Auth.js will create User+Account)', () => {
  const decision = decideSocialSignIn({ ...baseInput, existingUser: null })
  assert.equal(decision.kind, 'allow')
})

test('case B: returning user with same provider+sub → allow', () => {
  const decision = decideSocialSignIn({
    ...baseInput,
    existingUser: {
      id: 'u1',
      hasPasswordHash: false,
      emailVerifiedAt: new Date(),
      accounts: [{ provider: 'google', providerAccountId: 'sub_123' }],
    },
  })
  assert.equal(decision.kind, 'allow')
})

test('case C: same provider but different sub → deny(provider_account_mismatch)', () => {
  const decision = decideSocialSignIn({
    ...baseInput,
    existingUser: {
      id: 'u1',
      hasPasswordHash: false,
      emailVerifiedAt: new Date(),
      accounts: [{ provider: 'google', providerAccountId: 'OTHER_SUB' }],
    },
  })
  assert.equal(decision.kind, 'deny')
  if (decision.kind === 'deny') assert.equal(decision.reason, 'provider_account_mismatch')
})

test('case D: credentials user → redirect_link(credentials_collision)', () => {
  const decision = decideSocialSignIn({
    ...baseInput,
    existingUser: {
      id: 'u1',
      hasPasswordHash: true,
      emailVerifiedAt: new Date(),
      accounts: [],
    },
  })
  assert.equal(decision.kind, 'redirect_link')
  if (decision.kind === 'redirect_link') {
    assert.equal(decision.reason, 'credentials_collision')
    assert.equal(decision.email, 'juan@x.com')
    assert.equal(decision.provider, 'google')
    assert.equal(decision.providerAccountId, 'sub_123')
  }
})

test('case F: user without password and no matching Account → redirect_link(unverified)', () => {
  const decision = decideSocialSignIn({
    ...baseInput,
    existingUser: {
      id: 'u1',
      hasPasswordHash: false,
      emailVerifiedAt: null,
      accounts: [],
    },
  })
  assert.equal(decision.kind, 'redirect_link')
  if (decision.kind === 'redirect_link') {
    assert.equal(decision.reason, 'unverified_credentials_collision')
  }
})

test('kill switch: deny regardless of user state', () => {
  const decision = decideSocialSignIn({
    ...baseInput,
    killSwitchEngaged: true,
    existingUser: null,
  })
  assert.equal(decision.kind, 'deny')
  if (decision.kind === 'deny') assert.equal(decision.reason, 'kill_switch')
})

test('kill switch beats every other case (returning user, collision, etc.)', () => {
  const decision = decideSocialSignIn({
    ...baseInput,
    killSwitchEngaged: true,
    existingUser: {
      id: 'u1',
      hasPasswordHash: true,
      emailVerifiedAt: new Date(),
      accounts: [{ provider: 'google', providerAccountId: 'sub_123' }],
    },
  })
  assert.equal(decision.kind, 'deny')
})

test('different provider does NOT match an existing google Account', () => {
  // Same email, existing google account, signin attempt is from apple.
  // Expect: case D (credentials user) or case F (no password) — here
  // the user has no password, so case F.
  const decision = decideSocialSignIn({
    ...baseInput,
    provider: 'apple',
    providerAccountId: 'apple_sub',
    existingUser: {
      id: 'u1',
      hasPasswordHash: false,
      emailVerifiedAt: new Date(),
      accounts: [{ provider: 'google', providerAccountId: 'sub_123' }],
    },
  })
  assert.equal(decision.kind, 'redirect_link')
})

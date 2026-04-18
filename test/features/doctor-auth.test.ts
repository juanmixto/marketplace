import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Contract tests for scripts/doctor-auth.mjs and the --auth branch of
 * scripts/doctor.mjs (#526).
 *
 * The authenticated probes feed doctor the session cookie it needs to
 * reach post-middleware pages. A silent regression here means the
 * probe passes as 307-and-healthy when in fact it never exercised the
 * protected server component — defeating the whole layer.
 */

async function importDoctorAuth() {
  return await import(`${process.cwd()}/scripts/doctor-auth.mjs`)
}

test('scripts/doctor-auth.mjs exists', () => {
  assert.ok(existsSync(join(process.cwd(), 'scripts/doctor-auth.mjs')))
})

test('SEEDED_PROBE_USERS covers customer/vendor/admin with seeded emails', async () => {
  const { SEEDED_PROBE_USERS } = await importDoctorAuth()
  assert.equal(SEEDED_PROBE_USERS.customer.email, 'cliente@test.com')
  assert.equal(SEEDED_PROBE_USERS.customer.role, 'CUSTOMER')
  assert.equal(SEEDED_PROBE_USERS.vendor.email, 'productor@test.com')
  assert.equal(SEEDED_PROBE_USERS.vendor.role, 'VENDOR')
  assert.equal(SEEDED_PROBE_USERS.admin.email, 'admin@marketplace.com')
  assert.equal(SEEDED_PROBE_USERS.admin.role, 'SUPERADMIN')
})

test('buildSessionCookie throws without AUTH_SECRET', async () => {
  const { buildSessionCookie } = await importDoctorAuth()
  const prev = process.env.AUTH_SECRET
  delete process.env.AUTH_SECRET
  try {
    await assert.rejects(
      () =>
        buildSessionCookie({
          baseUrl: 'http://localhost:3000',
          userId: 'u1',
          role: 'CUSTOMER',
          email: 'a@b.com',
        }),
      /AUTH_SECRET is required/,
    )
  } finally {
    if (prev !== undefined) process.env.AUTH_SECRET = prev
  }
})

test('buildSessionCookie throws without userId or role', async () => {
  const { buildSessionCookie } = await importDoctorAuth()
  await assert.rejects(
    () =>
      buildSessionCookie({
        baseUrl: 'http://localhost:3000',
        userId: '',
        role: 'CUSTOMER',
        secret: 'x'.repeat(32),
      }),
    /userId and role are required/,
  )
})

test('buildSessionCookie returns authjs.session-token on http', async () => {
  const { buildSessionCookie } = await importDoctorAuth()
  const cookie = await buildSessionCookie({
    baseUrl: 'http://localhost:3000',
    userId: 'uid-123',
    role: 'CUSTOMER',
    email: 'a@b.com',
    secret: 'x'.repeat(32),
  })
  assert.match(cookie, /^authjs\.session-token=/)
  // The encoded JWE segment is long and dot-delimited.
  const [, value] = cookie.split('=')
  assert.ok(value && value.split('.').length >= 4, 'cookie value looks like a JWE')
})

test('buildSessionCookie returns __Secure- prefix on https', async () => {
  const { buildSessionCookie } = await importDoctorAuth()
  const cookie = await buildSessionCookie({
    baseUrl: 'https://app.example.com',
    userId: 'uid-123',
    role: 'VENDOR',
    email: 'v@ex.com',
    secret: 'x'.repeat(32),
  })
  assert.match(cookie, /^__Secure-authjs\.session-token=/)
})

test('doctor.mjs wires --auth flag and AUTH_PROBE_MATRIX', () => {
  const content = readFileSync(join(process.cwd(), 'scripts/doctor.mjs'), 'utf-8')
  assert.ok(content.includes("'--auth'"), 'must parse --auth CLI flag')
  assert.ok(content.includes('AUTH_PROBE_MATRIX'), 'must define AUTH_PROBE_MATRIX')
  assert.ok(content.includes('runAuthenticatedProbes'), 'must call runAuthenticatedProbes')
  assert.ok(content.includes('authProbes'), 'report must expose authProbes field')
  // Each role must be probed on at least one representative post-auth path.
  assert.ok(content.includes('/vendor/dashboard'), 'probes vendor dashboard')
  assert.ok(content.includes('/admin/dashboard'), 'probes admin dashboard')
  assert.ok(content.includes('/cuenta'), 'probes buyer account')
})

test('.github/workflows/doctor.yml invokes doctor with --auth', () => {
  const content = readFileSync(
    join(process.cwd(), '.github/workflows/doctor.yml'),
    'utf-8',
  )
  assert.ok(
    content.includes('--auth'),
    'workflow must pass --auth so authenticated probes run in CI',
  )
})

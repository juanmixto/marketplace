import test from 'node:test'
import assert from 'node:assert/strict'
import type { Event } from '@sentry/nextjs'
import { scrubPayload, scrubSentryEvent } from '@/lib/sentry/scrubber'

/**
 * PII scrubber regression suite (#523).
 *
 * Every test names a specific PII class that must never reach Sentry.
 * Adding a new pattern to the scrubber requires a test here proving
 * the input it targets is caught.
 */

// ── scrubPayload: key-based redaction ────────────────────────────────────

test('scrubPayload redacts keys matching password/token/secret', () => {
  const input = {
    username: 'ada',
    password: 'hunter2',
    token: 'eyJhbGciOi...',
    clientSecret: 'sk_live_abc',
    normalField: 'keep-me',
  }
  const out = scrubPayload(input)
  assert.equal(out.password, '[redacted]')
  assert.equal(out.token, '[redacted]')
  assert.equal(out.clientSecret, '[redacted]')
  assert.equal(out.username, 'ada')
  assert.equal(out.normalField, 'keep-me')
})

test('scrubPayload redacts keys matching email/phone/address (case-insensitive)', () => {
  const input = {
    Email: 'a@b.com',
    correo: 'c@d.com',
    phone: '+34 600 000 000',
    telefono: '+34 600 000 000',
    address: 'Calle Mayor 1',
    direccion: 'Calle Mayor 1',
    postalCode: '28001',
    cp: '28001',
  }
  const out = scrubPayload(input)
  for (const v of Object.values(out)) {
    assert.equal(v, '[redacted]', `expected [redacted], got ${JSON.stringify(v)}`)
  }
})

// ── scrubPayload: value-based pattern scrubbing ──────────────────────────

test('scrubPayload strips emails inside free-text strings', () => {
  const input = {
    message: 'User ada@example.com could not log in',
    trace: 'at /home/x with contact jane@work.io',
  }
  const out = scrubPayload(input)
  assert.equal(out.message, 'User [redacted] could not log in')
  assert.equal(out.trace, 'at /home/x with contact [redacted]')
})

test('scrubPayload strips Stripe-style tokens anywhere', () => {
  const input = {
    log: 'Payment pi_1Abc123def456ghi789 failed',
    ref: 'ch_1XyZabcdef012345',
  }
  const out = scrubPayload(input)
  assert.match(out.log, /\[redacted\]/)
  assert.ok(!out.log.includes('pi_1Abc123'))
  assert.equal(out.ref, '[redacted]')
})

test('scrubPayload strips JWT-like long tokens', () => {
  const input = {
    header: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MX0.abc123def',
  }
  const out = scrubPayload(input)
  assert.match(out.header, /Bearer \[redacted\]/)
})

test('scrubPayload strips phone numbers inside strings', () => {
  const input = { note: 'Customer reachable at +34 600 123 456 or 600-123-456' }
  const out = scrubPayload(input)
  assert.ok(!out.note.includes('600'), `phone leaked: ${out.note}`)
})

// ── scrubPayload: structural edge cases ──────────────────────────────────

test('scrubPayload handles nested objects', () => {
  const input = {
    user: { email: 'a@b.com', id: 'ok' },
    meta: { stripe: { token: 'sk_abc', amount: 100 } },
  }
  const out = scrubPayload(input)
  assert.equal(out.user.email, '[redacted]')
  assert.equal(out.user.id, 'ok')
  assert.equal(out.meta.stripe.token, '[redacted]')
  assert.equal(out.meta.stripe.amount, 100)
})

test('scrubPayload does not crash on arrays', () => {
  const input = { trace: ['at user a@b.com', 'at line 42'] }
  const out = scrubPayload(input)
  assert.ok(Array.isArray(out.trace))
  assert.equal(out.trace[0], 'at user [redacted]')
  assert.equal(out.trace[1], 'at line 42')
})

test('scrubPayload handles null / undefined / primitives', () => {
  assert.equal(scrubPayload(null), null)
  assert.equal(scrubPayload(undefined), undefined)
  assert.equal(scrubPayload(42), 42)
  assert.equal(scrubPayload(true), true)
  assert.equal(scrubPayload('ada@b.com'), '[redacted]')
})

test('scrubPayload survives cycles without stack overflow', () => {
  const a: Record<string, unknown> = { label: 'a@b.com' }
  const b: Record<string, unknown> = { parent: a }
  a.child = b
  const out = scrubPayload(a)
  // Must not throw; label must be scrubbed.
  assert.equal(out.label, '[redacted]')
})

// ── scrubSentryEvent: end-to-end event shape ─────────────────────────────

test('scrubSentryEvent strips user to {id} only', () => {
  const event: Event = {
    user: {
      id: 'user-1',
      email: 'a@b.com',
      username: 'ada',
      ip_address: '1.2.3.4',
    },
  }
  const out = scrubSentryEvent(event)
  assert.ok(out)
  assert.deepEqual(out!.user, { id: 'user-1' })
})

test('scrubSentryEvent drops cookies entirely', () => {
  const event: Event = {
    request: {
      cookies: { session: 'abc', csrf: 'xyz' },
      headers: { 'user-agent': 'x', cookie: 'session=abc' },
    },
  }
  const out = scrubSentryEvent(event)
  assert.ok(out)
  assert.equal(out!.request?.cookies, undefined)
})

test('scrubSentryEvent allow-lists only safe headers', () => {
  const event: Event = {
    request: {
      headers: {
        'user-agent': 'ok',
        authorization: 'Bearer abc',
        cookie: 'session=x',
        'x-custom-secret': 'nope',
        'accept-language': 'es',
      },
    },
  }
  const out = scrubSentryEvent(event)
  assert.ok(out?.request?.headers)
  const keys = Object.keys(out!.request!.headers!)
  assert.ok(keys.includes('user-agent'))
  assert.ok(keys.includes('accept-language'))
  assert.ok(!keys.includes('authorization'))
  assert.ok(!keys.includes('cookie'))
  assert.ok(!keys.includes('x-custom-secret'))
})

test('scrubSentryEvent strips email from exception message', () => {
  const event: Event = {
    exception: {
      values: [{ type: 'Error', value: 'Could not find user ada@example.com' }],
    },
  }
  const out = scrubSentryEvent(event)
  assert.ok(out?.exception?.values)
  assert.equal(out!.exception!.values![0].value, 'Could not find user [redacted]')
})

test('scrubSentryEvent scrubs breadcrumbs', () => {
  const event: Event = {
    breadcrumbs: [
      {
        category: 'console',
        message: 'GET /api/users?email=a@b.com',
        data: { phone: '+34 600 000 000' },
      },
    ],
  }
  const out = scrubSentryEvent(event)
  assert.ok(out?.breadcrumbs)
  assert.match(out!.breadcrumbs![0].message!, /\[redacted\]/)
  assert.equal(out!.breadcrumbs![0].data!.phone, '[redacted]')
})

test('scrubSentryEvent drops the event (returns null) if scrubbing itself throws', () => {
  // Construct a payload that would normally make stringification explode.
  const evilGetter = {
    get value() {
      throw new Error('boom')
    },
  }
  const event = { exception: { values: [evilGetter] } } as unknown as Event
  const out = scrubSentryEvent(event)
  // Either clean result or null — NEVER the original unscrubbed event.
  assert.ok(out === null || out !== event)
})

test('scrubSentryEvent logs to stderr when scrubbing crashes (no silent swallow)', () => {
  const originalError = console.error
  const calls: unknown[][] = []
  console.error = (...args: unknown[]) => {
    calls.push(args)
  }
  try {
    const evilGetter = {
      get value() {
        throw new Error('cycle-or-crash')
      },
    }
    const event = { exception: { values: [evilGetter] } } as unknown as Event
    const out = scrubSentryEvent(event)
    assert.equal(out, null, 'scrubber must drop the event when it crashes')
    assert.ok(
      calls.some(
        args =>
          typeof args[0] === 'string' && args[0].includes('sentry-scrubber')
      ),
      'scrubber crash must be reported to stderr so operators see observability dead-zones'
    )
  } finally {
    console.error = originalError
  }
})

test('scrubSentryEvent handles cyclic objects without throwing', () => {
  // Cyclic references in error extras are a common shape once Prisma or
  // Node internals surface. Any deep-walk that blows the stack must be
  // absorbed by the catch-all rather than tumbling the whole beforeSend
  // hook.
  const cyclic: Record<string, unknown> = { name: 'root' }
  cyclic.self = cyclic
  const event: Event = {
    extra: { payload: cyclic },
  }
  // Must not throw and must never return the untouched original.
  const out = scrubSentryEvent(event)
  assert.ok(out === null || out !== event)
})

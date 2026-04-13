/**
 * Contact form antiabuse tests (#173)
 *
 * Verifies the rate limiting layer on /api/contacto, both per-IP and
 * per-identity. The form fans out to email when CONTACT_EMAIL is set, so an
 * unprotected endpoint becomes a free mail-bomb against the operator.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { POST as contactRoute } from '@/app/api/contacto/route'

function buildRequest(overrides: Partial<{ email: string; ip: string; nombre: string; mensaje: string }> = {}) {
  const ip = overrides.ip ?? '203.0.113.50'
  const body = {
    nombre: overrides.nombre ?? 'Persona Pruebas',
    email: overrides.email ?? 'tester@example.com',
    asunto: 'general' as const,
    mensaje: overrides.mensaje ?? 'Mensaje de prueba con longitud suficiente para validar.',
    privacidad: true as const,
  }

  return new Request('http://localhost:3000/api/contacto', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Pretend we are behind a trusted proxy so getClientIP differentiates senders.
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  }) as never
}

test('contact form blocks per-IP after the configured ceiling (#173)', async () => {
  const original = process.env.TRUST_PROXY_HEADERS
  process.env.TRUST_PROXY_HEADERS = 'true'

  try {
    const ip = '198.51.100.10'
    // 5 allowed in the IP bucket. Use distinct emails so the per-email
    // counter doesn't trip first.
    const allowed = []
    for (let i = 0; i < 5; i++) {
      const res = await contactRoute(buildRequest({ ip, email: `flood-${i}@example.com` }))
      allowed.push(res.status)
    }
    assert.deepEqual(allowed, [200, 200, 200, 200, 200])

    const blocked = await contactRoute(buildRequest({ ip, email: 'flood-6@example.com' }))
    assert.equal(blocked.status, 429)
    assert.equal(blocked.headers.get('X-RateLimit-Limit'), '5')
    assert.ok(blocked.headers.get('Retry-After'))
  } finally {
    if (original === undefined) delete process.env.TRUST_PROXY_HEADERS
    else process.env.TRUST_PROXY_HEADERS = original
  }
})

test('contact form blocks per-identity even from rotating IPs (#173)', async () => {
  const original = process.env.TRUST_PROXY_HEADERS
  process.env.TRUST_PROXY_HEADERS = 'true'

  try {
    const email = 'identity-flood@example.com'
    // Each request uses a different IP so the per-IP bucket never reaches its
    // limit; the per-email bucket (3) should be the one that trips.
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const res = await contactRoute(buildRequest({ ip: `198.51.100.${100 + i}`, email }))
      statuses.push(res.status)
    }
    assert.deepEqual(statuses, [200, 200, 200, 429])
  } finally {
    if (original === undefined) delete process.env.TRUST_PROXY_HEADERS
    else process.env.TRUST_PROXY_HEADERS = original
  }
})

test('contact form normalizes email casing for the per-identity bucket (#173)', async () => {
  const original = process.env.TRUST_PROXY_HEADERS
  process.env.TRUST_PROXY_HEADERS = 'true'

  try {
    const ipBase = '198.51.100.20'
    const variants = [
      'casing-test@Example.com',
      'CASING-test@example.COM',
      'Casing-Test@Example.com',
      'casing-test@example.com',
    ]

    const statuses: number[] = []
    for (let i = 0; i < variants.length; i++) {
      const res = await contactRoute(buildRequest({ ip: `${ipBase}${i}`, email: variants[i]! }))
      statuses.push(res.status)
    }

    // 4 attempts, all variants resolve to the same normalized address; per-id
    // limit is 3, so the 4th should be rejected even though every IP is fresh.
    assert.deepEqual(statuses, [200, 200, 200, 429])
  } finally {
    if (original === undefined) delete process.env.TRUST_PROXY_HEADERS
    else process.env.TRUST_PROXY_HEADERS = original
  }
})

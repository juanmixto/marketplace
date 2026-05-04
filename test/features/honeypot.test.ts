/**
 * Honeypot field tests (#1271).
 *
 * Verifies both `/api/contacto` and `/api/auth/register` silently swallow
 * a submission whose hidden `website` field is populated. The treatment
 * is intentionally a 2xx with the success copy — a 4xx would tip off the
 * bot author that the field is a tell, defeating the cheap defense.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { POST as contactRoute } from '@/app/api/contacto/route'
import { isHoneypotTripped } from '@/lib/honeypot'

test('isHoneypotTripped detects non-empty strings only', () => {
  assert.equal(isHoneypotTripped(''), false)
  assert.equal(isHoneypotTripped('   '), false)
  assert.equal(isHoneypotTripped(undefined), false)
  assert.equal(isHoneypotTripped(null), false)
  assert.equal(isHoneypotTripped(0), false)
  assert.equal(isHoneypotTripped('http://spam.com'), true)
  assert.equal(isHoneypotTripped(' x '), true)
})

test('contact form silently succeeds when honeypot is filled (#1271)', async () => {
  const original = process.env.TRUST_PROXY_HEADERS
  process.env.TRUST_PROXY_HEADERS = 'true'

  try {
    const req = new Request('http://localhost:3000/api/contacto', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.99',
      },
      body: JSON.stringify({
        nombre: 'Bot Pruebas',
        email: 'bot@example.com',
        asunto: 'general',
        mensaje: 'Mensaje del bot con longitud para pasar zod si llegara.',
        privacidad: true,
        website: 'http://spam.example.com',
      }),
    }) as never

    const res = await contactRoute(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    // Crucially, the response copy MATCHES the legit success path so
    // the bot can't distinguish "we noticed your honeypot" from "we
    // emailed support". Equality with the genuine success message is
    // the contract worth keeping.
    assert.match(json.message, /Mensaje recibido/i)
  } finally {
    if (original === undefined) delete process.env.TRUST_PROXY_HEADERS
    else process.env.TRUST_PROXY_HEADERS = original
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  scrubPayload,
  scrubString,
  scrubStringLogger,
  REDACT_KEY_PATTERN,
} from '@/lib/scrubber'
import { redact } from '@/lib/logger'

/**
 * Issue #1354 (epic #1346 — PII pre-launch).
 *
 * Pre-#1354 the logger and Sentry scrubbers had drifted patterns. The
 * single-source-of-truth lives in `@/lib/scrubber`; this suite both
 * (a) covers each new pattern (DNI/NIE, ES phone, IBAN value) and
 * (b) asserts logger ≡ Sentry on a canonical PII corpus so a future
 * regression that touches one and forgets the other trips the test.
 *
 * Sentry-specific event-shape scrubbing (request/cookies/headers) is
 * still in `test/features/sentry-scrubber.test.ts` — that's correct,
 * those concerns are not shared.
 */

// ─── Per-pattern coverage ────────────────────────────────────────────────────

test('DNI is redacted in value position', () => {
  const out = scrubString('El cliente tiene DNI 12345678Z y compró ayer.')
  assert.ok(!out.includes('12345678Z'), `DNI leaked: ${out}`)
})

test('NIE is redacted in value position', () => {
  const out = scrubString('Su NIE es X1234567L para el padrón.')
  assert.ok(!out.includes('X1234567L'), `NIE leaked: ${out}`)
})

test('Spanish mobile (no separators) is redacted', () => {
  const out = scrubString('Llama al 600123456 antes de las 18h.')
  assert.ok(!out.includes('600123456'), `phone leaked: ${out}`)
})

test('Spanish mobile with +34 prefix is redacted', () => {
  const out = scrubString('Contacto: +34 600123456')
  assert.ok(!out.includes('600123456'), `phone leaked: ${out}`)
})

test('separator-rich phone is redacted by the fallback pattern', () => {
  const out = scrubString('Móvil 600-123-456 / fijo (91) 555-1234')
  assert.ok(!out.includes('600-123-456'), `phone leaked: ${out}`)
})

test('IBAN value is redacted even when the key name is innocuous', () => {
  const out = scrubString('La cuenta del proveedor es ES9121000418450200051332 confirmado.')
  assert.ok(!out.includes('ES9121000418450200051332'), `IBAN leaked: ${out}`)
})

test('email is redacted in free text', () => {
  const out = scrubString('mensaje a juan@example.com rebotado')
  assert.ok(!out.includes('juan@example.com'), `email leaked: ${out}`)
})

// ─── Key-pattern coverage (new entries from #1354) ───────────────────────────

test('REDACT_KEY_PATTERN matches DNI / NIE keys', () => {
  assert.ok(REDACT_KEY_PATTERN.test('dni'))
  assert.ok(REDACT_KEY_PATTERN.test('userDNI'))
  assert.ok(REDACT_KEY_PATTERN.test('nie'))
  assert.ok(REDACT_KEY_PATTERN.test('clientNIE'))
})

test('REDACT_KEY_PATTERN matches phone / address keys', () => {
  assert.ok(REDACT_KEY_PATTERN.test('phone'))
  assert.ok(REDACT_KEY_PATTERN.test('telefono'))
  assert.ok(REDACT_KEY_PATTERN.test('address'))
  assert.ok(REDACT_KEY_PATTERN.test('direccion'))
  assert.ok(REDACT_KEY_PATTERN.test('postalCode'))
  assert.ok(REDACT_KEY_PATTERN.test('cp'))
})

// ─── scrubPayload integration ────────────────────────────────────────────────

test('scrubPayload redacts a full PII bag end-to-end', () => {
  const out = scrubPayload({
    user: {
      email: 'a@b.com',
      phone: '+34 600123456',
      dni: '12345678Z',
      nie: 'Y1234567A',
      address: 'Calle Falsa 123',
      postalCode: '28001',
    },
    note: 'IBAN ES9121000418450200051332, contacto juan@example.com, móvil 600-123-456',
    cardCvv: '123',
    cookie: 'session=abc',
  })

  // Keys are redacted to the literal token, not just empty.
  assert.equal(out.user.email, '[redacted]')
  assert.equal(out.user.phone, '[redacted]')
  assert.equal(out.user.dni, '[redacted]')
  assert.equal(out.user.nie, '[redacted]')
  assert.equal(out.user.address, '[redacted]')
  assert.equal(out.user.postalCode, '[redacted]')
  assert.equal(out.cardCvv, '[redacted]')
  assert.equal(out.cookie, '[redacted]')

  // Free-text values are scrubbed inside.
  assert.ok(!out.note.includes('ES9121000418450200051332'), `IBAN leaked: ${out.note}`)
  assert.ok(!out.note.includes('juan@example.com'), `email leaked: ${out.note}`)
  assert.ok(!out.note.includes('600-123-456'), `phone leaked: ${out.note}`)
})

// ─── Parity contract: logger ≡ Sentry ────────────────────────────────────────

test('parity: every PII string scrubbed by Sentry is also scrubbed by logger', () => {
  const corpus = [
    'IBAN ES9121000418450200051332',
    'DNI 12345678Z',
    'NIE Y1234567A',
    'phone +34 600123456',
    'phone 600-123-456',
    'email a@b.com',
    'token sk_live_abcdefghij1234567890',
    'jwt-ish abcdef0123456789ABCDEFGHIJklmnopqr.something10chars.alphanum123_-',
  ]

  for (const original of corpus) {
    const sentry = scrubString(original)
    const logger = scrubStringLogger(original)
    // Both must have replaced *something*.
    assert.notEqual(sentry, original, `Sentry didn't redact: ${original}`)
    assert.notEqual(logger, original, `logger didn't redact: ${original}`)
    // The structure (counted REDACTED tokens, position) should match
    // — modulo the literal redaction marker. Replace the marker so we
    // can compare shape.
    const sentryShape = sentry.replace(/\[redacted\]/g, '<R>')
    const loggerShape = logger.replace(/\[REDACTED\]/g, '<R>')
    assert.equal(loggerShape, sentryShape, `shape diverged for: ${original}`)
  }
})

test('parity: every key that logger redacts, Sentry redacts too', () => {
  const sensitiveKeys = [
    'password',
    'token',
    'cookie',
    'iban',
    'email',
    'phone',
    'telefono',
    'dni',
    'nie',
    'address',
    'direccion',
    'postalCode',
    'cp',
    'cardNumber',
    'cvv',
  ]

  for (const key of sensitiveKeys) {
    const loggerOut = redact({ [key]: 'sensitive-value' })
    const sentryOut = scrubPayload({ [key]: 'sensitive-value' })
    // Both must have removed the original value. We accept either
    // [REDACTED] or [redacted] (the only marker difference).
    assert.notEqual(
      (loggerOut as Record<string, unknown>)[key],
      'sensitive-value',
      `logger kept key=${key} in plaintext`,
    )
    assert.notEqual(
      (sentryOut as Record<string, unknown>)[key],
      'sensitive-value',
      `Sentry kept key=${key} in plaintext`,
    )
  }
})

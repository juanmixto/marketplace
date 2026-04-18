/**
 * Unit test for the 2FA secret encryption primitives. The TOTP
 * verification + replay flow lives in an integration test (needs
 * Prisma) — the crypto round-trip is side-effect-free and belongs
 * here.
 *
 * We purposely do NOT test with a stable ciphertext: AES-GCM uses a
 * random IV per call, so two encryptions of the same plaintext are
 * never equal. The invariant is "decrypt(encrypt(x)) === x" and
 * "tag mismatch rejects with a throw".
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { encryptSecret, decryptSecret } from '@/domains/auth/two-factor-crypto'

test('AES-GCM round-trip recovers the original secret', () => {
  const secret = 'JBSWY3DPEHPK3PXP' // canonical RFC 4648 base32 sample
  const wire = encryptSecret(secret)
  assert.notEqual(wire, secret, 'ciphertext must differ from plaintext')
  assert.equal(decryptSecret(wire), secret)
})

test('two encryptions of the same plaintext produce different ciphertexts (fresh IV)', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const a = encryptSecret(secret)
  const b = encryptSecret(secret)
  assert.notEqual(a, b, 'IV reuse would be a catastrophic AES-GCM failure')
})

test('tampered ciphertext fails the GCM tag check', () => {
  const secret = 'JBSWY3DPEHPK3PXP'
  const wire = encryptSecret(secret)
  const [iv, ct, tag] = wire.split('.')
  // Flip one byte in the ciphertext.
  const tamperedCt = Buffer.from(ct!, 'base64')
  tamperedCt[0] = tamperedCt[0]! ^ 0xff
  const tampered = [iv, tamperedCt.toString('base64'), tag].join('.')
  assert.throws(() => decryptSecret(tampered))
})

test('malformed wire format throws invalid_ciphertext', () => {
  assert.throws(() => decryptSecret('not.enough'), /invalid_ciphertext/)
  assert.throws(() => decryptSecret(''), /invalid_ciphertext/)
})

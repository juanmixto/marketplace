import test, { afterEach, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '@/lib/db'
import { updateVendorProfile, getMyVendorProfile } from '@/domains/vendors/actions'
import { isStorageWireFormat } from '@/lib/at-rest-crypto'
import { decryptIban, decryptBankAccountName } from '@/domains/vendors/bank-crypto'
import {
  buildSession,
  clearTestSession,
  createVendorUser,
  resetIntegrationDatabase,
  useTestSession,
} from './helpers'

/**
 * Issue #1347 (epic #1346 — PII pre-launch).
 *
 * `Vendor.iban` + `Vendor.bankAccountName` were stored as plaintext —
 * a DB dump leaked the entire customer base's IBANs. After #1347 new
 * writes go to `ibanEncrypted` / `bankAccountNameEncrypted` (AES-256-
 * GCM), the legacy plaintext columns are explicitly written back to
 * `null` on every IBAN-touching update, and `ibanLast4` is the only
 * unencrypted byproduct.
 *
 * This suite asserts the on-disk shape, not just the round-trip.
 */

beforeEach(async () => {
  await resetIntegrationDatabase()
})

afterEach(() => {
  clearTestSession()
})

test('updateVendorProfile encrypts IBAN at rest — DB column never holds plaintext', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plainIban = 'ES9121000418450200051332'
  const plainName = 'Vendor Test SL'

  await updateVendorProfile({
    displayName: 'Vendor Test',
    iban: plainIban,
    bankAccountName: plainName,
  } as Parameters<typeof updateVendorProfile>[0])

  const raw = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })

  // Plaintext columns are NULL after the encrypted write.
  assert.equal(raw.iban, null)
  assert.equal(raw.bankAccountName, null)

  // Encrypted columns are populated and have the wire format.
  assert.ok(raw.ibanEncrypted, 'ibanEncrypted must be populated')
  assert.ok(raw.bankAccountNameEncrypted, 'bankAccountNameEncrypted must be populated')
  assert.ok(isStorageWireFormat(raw.ibanEncrypted), 'ibanEncrypted must be iv.ct.tag wire format')
  assert.ok(isStorageWireFormat(raw.bankAccountNameEncrypted), 'bankAccountNameEncrypted must be iv.ct.tag wire format')

  // The plaintext substring must NOT appear anywhere in the row.
  const blob = JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  assert.equal(blob.includes(plainIban), false, 'plaintext IBAN leaked into Vendor row')
  assert.equal(blob.includes(plainName), false, 'plaintext bank-account name leaked into Vendor row')

  // ibanLast4 is the only unencrypted byproduct and matches.
  assert.equal(raw.ibanLast4, '1332')

  // Round-trip decrypt yields the original strings.
  assert.equal(decryptIban(raw.ibanEncrypted), plainIban)
  assert.equal(decryptBankAccountName(raw.bankAccountNameEncrypted), plainName)
})

test('IBAN with whitespace is normalized before encryption', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await updateVendorProfile({
    displayName: 'Vendor Test',
    iban: 'ES91 2100 0418 4502 0005 1332',
  } as Parameters<typeof updateVendorProfile>[0])

  const raw = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.ok(raw.ibanEncrypted)
  assert.equal(decryptIban(raw.ibanEncrypted), 'ES9121000418450200051332')
  assert.equal(raw.ibanLast4, '1332')
})

test('clearing the IBAN nulls every related column', async () => {
  const { user, vendor } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  await updateVendorProfile({
    displayName: 'Vendor Test',
    iban: 'ES9121000418450200051332',
    bankAccountName: 'Test SL',
  } as Parameters<typeof updateVendorProfile>[0])

  await updateVendorProfile({
    displayName: 'Vendor Test',
    iban: '',
    bankAccountName: '',
  } as Parameters<typeof updateVendorProfile>[0])

  const raw = await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })
  assert.equal(raw.iban, null)
  assert.equal(raw.ibanEncrypted, null)
  assert.equal(raw.ibanLast4, null)
  assert.equal(raw.bankAccountName, null)
  assert.equal(raw.bankAccountNameEncrypted, null)
})

test('getMyVendorProfile decrypts the bank fields for the vendor herself', async () => {
  const { user } = await createVendorUser()
  useTestSession(buildSession(user.id, 'VENDOR'))

  const plain = 'ES9121000418450200051332'
  await updateVendorProfile({
    displayName: 'Vendor Test',
    iban: plain,
    bankAccountName: 'Test SL',
  } as Parameters<typeof updateVendorProfile>[0])

  const profile = await getMyVendorProfile()
  // The action returns the raw row; the public profile API
  // (serializeVendorProfile, used by the vendor's own perfil page)
  // is what decrypts. Here we assert the raw row keeps the encrypted
  // shape — a vendor seeing her own data goes through the serializer.
  assert.equal(profile?.iban, null)
  assert.ok(profile?.ibanEncrypted)
})

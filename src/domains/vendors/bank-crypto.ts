/**
 * Vendor-bank PII at-rest encryption (#1347, epic #1346).
 *
 * Two domain-separated keys derived from `AUTH_SECRET`:
 *   - 'vendor-iban:v1'      → encrypts `Vendor.ibanEncrypted`
 *   - 'vendor-bank-name:v1' → encrypts `Vendor.bankAccountNameEncrypted`
 *
 * Domain separation means a leak of one ciphertext class cannot decrypt
 * the other. Bumping `:v2` is the rotation hook — existing `:v1` rows
 * stay readable until re-encrypted by a follow-up backfill.
 */

import {
  encryptForStorage,
  decryptFromStorage,
  isStorageWireFormat,
} from '@/lib/at-rest-crypto'

const IBAN_KEY = 'vendor-iban:v1'
const BANK_NAME_KEY = 'vendor-bank-name:v1'

export function encryptIban(plaintext: string): string {
  return encryptForStorage(plaintext, IBAN_KEY)
}

export function decryptIban(wire: string): string {
  return decryptFromStorage(wire, IBAN_KEY)
}

export function encryptBankAccountName(plaintext: string): string {
  return encryptForStorage(plaintext, BANK_NAME_KEY)
}

export function decryptBankAccountName(wire: string): string {
  return decryptFromStorage(wire, BANK_NAME_KEY)
}

export { isStorageWireFormat }

/**
 * Last 4 digits of the IBAN, with whitespace stripped. Used as an
 * unencrypted column so admin / vendor UIs can render `**** 1234`
 * without decrypting on every query — and so list pages don't need
 * to issue per-row crypto operations.
 *
 * Returns null if fewer than 4 alphanum chars remain after stripping.
 */
export function ibanLast4(plaintext: string): string | null {
  const stripped = plaintext.replace(/\s+/g, '').trim()
  if (stripped.length < 4) return null
  return stripped.slice(-4)
}

/**
 * Render-helper: turns a 4-char tail into `**** **** **** 1234`. Caller
 * supplies the already-stored `ibanLast4` (no decryption needed).
 */
export function maskIban(last4: string | null | undefined): string {
  if (!last4) return ''
  return `**** **** **** ${last4}`
}

/**
 * Decrypts the on-disk bank fields back to plaintext for the vendor's
 * OWN view (their own profile form, getMyVendorProfile). Falls back
 * to the legacy plaintext column during the dual-column transition
 * window so a row whose backfill hasn't run yet still renders. Admin
 * code paths must NOT call this — admin sees `ibanLast4` only.
 */
export function decryptVendorBankFields(input: {
  iban: string | null
  ibanEncrypted: string | null
  bankAccountName: string | null
  bankAccountNameEncrypted: string | null
}): { iban: string | null; bankAccountName: string | null } {
  const iban = input.ibanEncrypted ? decryptIban(input.ibanEncrypted) : input.iban
  const bankAccountName = input.bankAccountNameEncrypted
    ? decryptBankAccountName(input.bankAccountNameEncrypted)
    : input.bankAccountName
  return { iban, bankAccountName }
}

/**
 * Translates a form-payload IBAN value (`undefined` / `''` / non-empty)
 * into the partial Prisma update — plaintext column is always nulled
 * out, encrypted column + last4 are populated only when there's a
 * value to store. Returning `{}` when the field is absent leaves the
 * existing row untouched (prisma update ignores missing keys).
 */
export function computeIbanColumns(value: string | undefined): {
  iban?: null
  ibanEncrypted?: string | null
  ibanLast4?: string | null
} {
  if (value === undefined) return {}
  const trimmed = value.replace(/\s+/g, '').trim()
  if (trimmed.length === 0) {
    return { iban: null, ibanEncrypted: null, ibanLast4: null }
  }
  return {
    iban: null,
    ibanEncrypted: encryptIban(trimmed),
    ibanLast4: ibanLast4(trimmed),
  }
}

export function computeBankNameColumns(value: string | undefined): {
  bankAccountName?: null
  bankAccountNameEncrypted?: string | null
} {
  if (value === undefined) return {}
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return { bankAccountName: null, bankAccountNameEncrypted: null }
  }
  return {
    bankAccountName: null,
    bankAccountNameEncrypted: encryptBankAccountName(trimmed),
  }
}

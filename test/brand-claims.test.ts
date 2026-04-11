import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('brand claims are centralized with ownership and update guidance', () => {
  const claims = readSource('../src/lib/brand-claims.ts')

  assert.match(claims, /owner:/)
  assert.match(claims, /source:/)
  assert.match(claims, /updateWhen:/)
  assert.match(claims, /paymentSecurity/)
  assert.match(claims, /verificationProcess/)
})

test('public brand copy no longer hardcodes the old business figures', () => {
  const pages = [
    '../src/app/(public)/sobre-nosotros/page.tsx',
    '../src/app/(public)/como-vender/page.tsx',
    '../src/app/(public)/page.tsx',
    '../src/app/(public)/faq/page.tsx',
    '../src/app/(public)/contacto/page.tsx',
  ]

  for (const path of pages) {
    const source = readSource(path)
    assert.doesNotMatch(source, /150\+|10k\+|€2M\+|24-48h|24-48 horas/)
  }
})

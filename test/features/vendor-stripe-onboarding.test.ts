import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('vendor Stripe onboarding explains process, timing, checklist and completion clearly', () => {
  const ui = readSource('../../src/app/(vendor)/vendor/perfil/StripeConnectUI.tsx')
  const page = readSource('../../src/app/(vendor)/vendor/perfil/page.tsx')
  const es = readSource('../../src/i18n/locales/es.ts')
  const en = readSource('../../src/i18n/locales/en.ts')

  assert.match(ui, /onboardingCards/)
  assert.match(ui, /onboardingChecklist/)
  assert.match(ui, /configuredChecklist/)
  assert.match(ui, /vendor\.stripe\.processTitle/)
  assert.match(ui, /vendor\.stripe\.timeTitle/)
  assert.match(ui, /vendor\.stripe\.resultTitle/)
  assert.match(ui, /vendor\.stripe\.checklistTitle/)
  assert.match(ui, /vendor\.stripe\.configuredChecklistTitle/)
  assert.match(page, /StripeConnectUI onboarded=\{profile\.stripeOnboarded\}/)

  for (const source of [es, en]) {
    assert.match(source, /vendor\.stripe\.processTitle/)
    assert.match(source, /vendor\.stripe\.timeTitle/)
    assert.match(source, /vendor\.stripe\.resultTitle/)
    assert.match(source, /vendor\.stripe\.checklistTitle/)
    assert.match(source, /vendor\.stripe\.configuredChecklistTitle/)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('SignOutButton uses useT instead of hardcoded Spanish text', () => {
  const source = readSource('../../src/components/auth/SignOutButton.tsx')

  assert.match(source, /useT/)
  assert.match(source, /t\('signOut'\)/)
  assert.ok(
    !source.includes('Cerrar sesion') && !source.includes('Cerrar sesión'),
    'SignOutButton should not contain hardcoded Spanish sign-out text'
  )
})

test('signOut translation key exists in both locales and is non-empty', async () => {
  const { locales } = await import('@/i18n/locales')

  assert.ok('signOut' in locales.es, 'Spanish locale missing signOut')
  assert.ok('signOut' in locales.en, 'English locale missing signOut')
  assert.ok((locales.es as Record<string, string>).signOut.length > 0)
  assert.ok((locales.en as Record<string, string>).signOut.length > 0)
})

test('Personal data section is reachable from the buyer account index', async () => {
  const { buyerAccountItems } = await import('@/lib/navigation')
  const perfil = buyerAccountItems.find(item => item.href === '/cuenta/perfil')

  assert.ok(perfil, '/cuenta/perfil entry must exist in buyerAccountItems')
  assert.equal(perfil!.available, true, '/cuenta/perfil should be available, not "Coming soon"')
})

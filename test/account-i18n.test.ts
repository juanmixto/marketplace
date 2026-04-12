import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('SignOutButton uses useT instead of hardcoded Spanish text', () => {
  const source = readSource('../src/components/auth/SignOutButton.tsx')

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

test('buyer profile page uses getServerT and exposes localized metadata', () => {
  const source = readSource('../src/app/(buyer)/cuenta/perfil/page.tsx')

  assert.match(source, /getServerT/)
  assert.match(source, /generateMetadata/)
  assert.match(source, /t\('account\.profile\.title'\)/)
  assert.match(source, /t\('account\.profile\.subtitle'\)/)
  assert.ok(!source.includes('Mi perfil'), 'should not contain hardcoded "Mi perfil"')
  assert.ok(
    !source.includes('Gestiona tu información personal'),
    'should not contain hardcoded Spanish subtitle'
  )
})

test('BuyerProfileForm uses useT for every label, button and validation message', () => {
  const source = readSource('../src/components/buyer/BuyerProfileForm.tsx')

  assert.match(source, /useT/)
  const requiredCalls = [
    "t('account.profile.personalInfo')",
    "t('account.profile.firstName')",
    "t('account.profile.lastName')",
    "t('account.profile.email')",
    "t('account.profile.save')",
    "t('account.profile.saving')",
    "t('account.profile.saved')",
    "t('account.profile.changePassword')",
    "t('account.profile.currentPassword')",
    "t('account.profile.newPassword')",
    "t('account.profile.confirmPassword')",
    "t('account.profile.changingPassword')",
    "t('account.profile.passwordUpdated')",
    "t('account.profile.errFirstNameRequired')",
    "t('account.profile.errLastNameRequired')",
    "t('account.profile.errEmailInvalid')",
    "t('account.profile.errCurrentPasswordRequired')",
    "t('account.profile.errPasswordMin')",
    "t('account.profile.errPasswordsDontMatch')",
    "t('account.profile.errUpdateFailed')",
    "t('account.profile.errPasswordChangeFailed')",
    "t('account.profile.errCurrentPasswordIncorrect')",
    "t('account.profile.errEmailInUse')",
    "t('account.profile.errInvalidData')",
    "t('account.profile.errUnauthorized')",
  ]
  for (const call of requiredCalls) {
    assert.ok(source.includes(call), `BuyerProfileForm missing ${call}`)
  }

  const forbiddenSpanish = [
    'Información personal',
    'Cambiar contraseña',
    'Contraseña actual',
    'Nueva contraseña',
    'Confirmar contraseña',
    'Guardar cambios',
    'Guardando...',
    'Cambios guardados',
    'Apellidos requeridos',
    'Email inválido',
    'Las contraseñas no coinciden',
    'Mínimo 8 caracteres',
    'Error al actualizar perfil',
    'Error al cambiar contraseña',
  ]
  for (const phrase of forbiddenSpanish) {
    assert.ok(
      !source.includes(phrase),
      `BuyerProfileForm should not contain hardcoded Spanish phrase: ${phrase}`
    )
  }
})

test('BuyerProfileForm renders profile and password errors inline (per form, not at the top)', () => {
  const source = readSource('../src/components/buyer/BuyerProfileForm.tsx')

  assert.match(source, /profileError/)
  assert.match(source, /passwordError/)
  assert.ok(
    !/const \[error, setError\]/.test(source),
    'should not use a single shared error state at the top of the form'
  )
})

test('BuyerProfileForm maps API error codes to localized messages', () => {
  const source = readSource('../src/components/buyer/BuyerProfileForm.tsx')

  for (const code of ['current_password_incorrect', 'email_in_use', 'invalid_data', 'unauthorized']) {
    assert.ok(source.includes(`'${code}'`), `BuyerProfileForm missing code mapping for ${code}`)
  }
})

test('buyer profile + password API routes return error codes for client-side i18n', () => {
  const profileSource = readSource('../src/app/api/buyers/profile/route.ts')
  const passwordSource = readSource('../src/app/api/buyers/password/route.ts')

  assert.match(profileSource, /code: 'unauthorized'/)
  assert.match(profileSource, /code: 'email_in_use'/)
  assert.match(profileSource, /code: 'invalid_data'/)

  assert.match(passwordSource, /code: 'unauthorized'/)
  assert.match(passwordSource, /code: 'current_password_incorrect'/)
  assert.match(passwordSource, /code: 'invalid_data'/)
})

test('account.profile.* keys exist in both Spanish and English locales', async () => {
  const { locales } = await import('@/i18n/locales')

  const requiredKeys = [
    'account.profile.title',
    'account.profile.subtitle',
    'account.profile.personalInfo',
    'account.profile.firstName',
    'account.profile.lastName',
    'account.profile.email',
    'account.profile.save',
    'account.profile.saving',
    'account.profile.saved',
    'account.profile.changePassword',
    'account.profile.currentPassword',
    'account.profile.newPassword',
    'account.profile.confirmPassword',
    'account.profile.changingPassword',
    'account.profile.passwordUpdated',
    'account.profile.errFirstNameRequired',
    'account.profile.errLastNameRequired',
    'account.profile.errEmailInvalid',
    'account.profile.errCurrentPasswordRequired',
    'account.profile.errPasswordMin',
    'account.profile.errPasswordsDontMatch',
    'account.profile.errUpdateFailed',
    'account.profile.errPasswordChangeFailed',
    'account.profile.errCurrentPasswordIncorrect',
    'account.profile.errEmailInUse',
    'account.profile.errInvalidData',
    'account.profile.errUnauthorized',
  ]

  for (const key of requiredKeys) {
    assert.ok(key in locales.es, `Spanish locale missing key: ${key}`)
    assert.ok(key in locales.en, `English locale missing key: ${key}`)
    assert.ok((locales.es as Record<string, string>)[key].length > 0, `Spanish ${key} is empty`)
    assert.ok((locales.en as Record<string, string>)[key].length > 0, `English ${key} is empty`)
  }
})

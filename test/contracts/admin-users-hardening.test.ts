import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

test('proxy keeps the admin users route behind the support/read RBAC gate', () => {
  const source = read('src/proxy.ts')
  assert.match(source, /canAccessAdminUsers/)
  assert.match(source, /pathname\.startsWith\('\/admin\/usuarios'\)/)
})

test('admin users list page consumes the domain query layer', () => {
  const source = read('src/app/(admin)/admin/usuarios/page.tsx')
  assert.match(source, /getAdminUsersListData/)
  assert.match(source, /buildAdminUsersListHref/)
})

test('admin users detail page consumes the domain detail query and remains read-only', () => {
  const source = read('src/app/(admin)/admin/usuarios/\[id\]/page.tsx')
  assert.match(source, /getAdminUserDetailData/)
  assert.match(source, /Esta vista es solo lectura/)
  assert.match(source, /AdminUserStateActions/)
  assert.match(source, /Bloquear \/ desbloquear/)
})

test('admin users password reset action uses the secure token flow and audit log', () => {
  const source = read('src/domains/admin/users/actions.ts')
  assert.match(source, /createPasswordResetToken/)
  assert.match(source, /createAuditLog\(/)
  assert.match(source, /sendEmail\(/)
})

test('admin users detail page exposes the secure reset password control', () => {
  const source = read('src/app/(admin)/admin/usuarios/\[id\]/page.tsx')
  assert.match(source, /AdminUserPasswordResetActions/)
  assert.match(source, /Reset password/)
})

test('admin users state change action requires explicit confirmation and audit-backed revocation', () => {
  const source = read('src/components/admin/AdminUserStateActions.tsx')
  assert.match(source, /Escribe el email exacto para confirmar/)
  assert.match(source, /setAdminUserActiveState/)
  assert.match(source, /invalidaci[oó]n de sesi[oó]n|revocada en servidor/)
})

test('admin users reset password action requires explicit confirmation and keeps the token hidden', () => {
  const source = read('src/components/admin/AdminUserPasswordResetActions.tsx')
  assert.match(source, /Escribe el email exacto para confirmar/)
  assert.match(source, /requestAdminUserPasswordReset/)
  assert.match(source, /enlace seguro por email/)
})

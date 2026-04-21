import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAdminUsersListHref,
  parseAdminUsersSearchParams,
} from '@/domains/admin/users/navigation'

test('parseAdminUsersSearchParams normalizes unsafe values', () => {
  const filters = parseAdminUsersSearchParams({
    q: '  Alice  ',
    role: 'NOT_A_ROLE',
    state: 'inactive',
    vendor: 'with-vendor',
    emailVerification: 'verified',
    page: '0',
  })

  assert.deepEqual(filters, {
    q: 'Alice',
    role: 'all',
    state: 'inactive',
    vendor: 'with-vendor',
    emailVerification: 'verified',
    page: 1,
  })
})

test('buildAdminUsersListHref omits defaults and keeps active filters', () => {
  assert.equal(
    buildAdminUsersListHref({
      q: 'alice',
      role: 'VENDOR',
      state: 'inactive',
      vendor: 'with-vendor',
      emailVerification: 'verified',
    }),
    '/admin/usuarios?q=alice&role=VENDOR&state=inactive&vendor=with-vendor&emailVerification=verified'
  )
})

test('buildAdminUsersListHref keeps pagination only when necessary', () => {
  assert.equal(buildAdminUsersListHref({}, 1), '/admin/usuarios')
  assert.equal(buildAdminUsersListHref({ q: 'alice' }, 2), '/admin/usuarios?q=alice&page=2')
})

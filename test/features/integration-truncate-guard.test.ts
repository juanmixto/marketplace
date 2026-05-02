import test from 'node:test'
import assert from 'node:assert/strict'
import { assertSafeToTruncate, parseDatabaseName } from '../integration/safety'

test('parseDatabaseName extracts the path segment from a Postgres URL', () => {
  assert.equal(
    parseDatabaseName('postgresql://user:pass@localhost:5432/marketplace_test'),
    'marketplace_test',
  )
  assert.equal(
    parseDatabaseName('postgresql://user:pass@localhost:5432/marketplace?sslmode=require'),
    'marketplace',
  )
})

test('parseDatabaseName returns null for unparseable input', () => {
  assert.equal(parseDatabaseName(''), null)
  assert.equal(parseDatabaseName('not a url'), null)
  assert.equal(parseDatabaseName('postgresql://user:pass@host:5432/'), null)
})

test('assertSafeToTruncate passes when NODE_ENV=test and DB ends in _test', () => {
  assert.doesNotThrow(() =>
    assertSafeToTruncate({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/marketplace_test',
    }),
  )
})

test('assertSafeToTruncate rejects NODE_ENV=development even if DB ends in _test', () => {
  assert.throws(
    () =>
      assertSafeToTruncate({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/marketplace_test',
      }),
    /NODE_ENV is "development"/,
  )
})

test('assertSafeToTruncate rejects unset NODE_ENV', () => {
  assert.throws(
    () =>
      assertSafeToTruncate({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/marketplace_test',
      }),
    /NODE_ENV is "<unset>"/,
  )
})

test('assertSafeToTruncate rejects the dev DB name even with NODE_ENV=test', () => {
  // The 2026-04-29 incident: agent had NODE_ENV=test in their shell
  // but DATABASE_URL still pointed at the live dev DB. The DB-name
  // check is what catches this case.
  assert.throws(
    () =>
      assertSafeToTruncate({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/marketplace',
      }),
    /refusing to TRUNCATE non-test database "marketplace"/,
  )
})

test('assertSafeToTruncate rejects unparseable DATABASE_URL', () => {
  assert.throws(
    () =>
      assertSafeToTruncate({
        NODE_ENV: 'test',
        DATABASE_URL: 'not a url',
      }),
    /<unparseable>/,
  )
})

test('assertSafeToTruncate rejects empty DATABASE_URL', () => {
  assert.throws(
    () =>
      assertSafeToTruncate({
        NODE_ENV: 'test',
        DATABASE_URL: '',
      }),
    /<unparseable>/,
  )
})

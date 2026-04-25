import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createIdempotencyToken,
  withIdempotency,
  cleanupExpiredIdempotencyKeys,
  AlreadyProcessedError,
  type IdempotencyDbClient,
} from '@/lib/idempotency'

interface Row {
  scope: string
  token: string
  userId: string
  expiresAt: Date
}

function makeMemoryClient(): { client: IdempotencyDbClient; rows: Map<string, Row> } {
  const rows = new Map<string, Row>()
  const key = (scope: string, token: string) => `${scope}::${token}`
  const client: IdempotencyDbClient = {
    idempotencyKey: {
      create: async ({ data }) => {
        const k = key(data.scope, data.token)
        if (rows.has(k)) {
          const err = new Error('Unique constraint failed') as Error & { code: string }
          err.code = 'P2002'
          throw err
        }
        rows.set(k, data)
        return { id: 'fake', ...data }
      },
      deleteMany: async ({ where }) => {
        const cutoff = where.expiresAt.lt.getTime()
        let count = 0
        for (const [k, row] of rows) {
          if (row.expiresAt.getTime() < cutoff) {
            rows.delete(k)
            count++
          }
        }
        return { count }
      },
    },
  }
  return { client, rows }
}

test('createIdempotencyToken returns a UUID-shaped string', () => {
  const t = createIdempotencyToken()
  assert.match(t, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
})

test('createIdempotencyToken returns unique values across calls', () => {
  assert.notEqual(createIdempotencyToken(), createIdempotencyToken())
})

test('withIdempotency runs fn on first call and returns its value', async () => {
  const { client } = makeMemoryClient()
  let calls = 0
  const result = await withIdempotency(
    'scope.a',
    'token-1',
    'user-1',
    async () => {
      calls++
      return 'ok'
    },
    client,
  )
  assert.equal(result, 'ok')
  assert.equal(calls, 1)
})

test('replay with same (scope, token) throws AlreadyProcessedError', async () => {
  const { client } = makeMemoryClient()
  await withIdempotency('scope.b', 'token-2', 'user-1', async () => 'first', client)
  await assert.rejects(
    () => withIdempotency('scope.b', 'token-2', 'user-1', async () => 'second', client),
    (err: unknown) => {
      assert.ok(err instanceof AlreadyProcessedError)
      assert.equal((err as AlreadyProcessedError).scope, 'scope.b')
      assert.equal((err as AlreadyProcessedError).token, 'token-2')
      return true
    },
  )
})

test('different scopes with the same token are independent', async () => {
  const { client } = makeMemoryClient()
  await withIdempotency('scope.x', 'shared', 'user-1', async () => 'x', client)
  const result = await withIdempotency('scope.y', 'shared', 'user-1', async () => 'y', client)
  assert.equal(result, 'y')
})

test('cross-tenant replay also throws (no existence leak)', async () => {
  const { client } = makeMemoryClient()
  await withIdempotency('scope.c', 'token-3', 'user-1', async () => 'first', client)
  await assert.rejects(
    () => withIdempotency('scope.c', 'token-3', 'user-2', async () => 'second', client),
    AlreadyProcessedError,
  )
})

test('claim is burned even if fn throws (partial-commit safety)', async () => {
  const { client, rows } = makeMemoryClient()
  await assert.rejects(
    () =>
      withIdempotency(
        'scope.d',
        'token-4',
        'user-1',
        async () => {
          throw new Error('downstream failure')
        },
        client,
      ),
    /downstream failure/,
  )
  // Row was claimed before fn ran — second call still gets AlreadyProcessedError.
  assert.equal(rows.size, 1)
  await assert.rejects(
    () => withIdempotency('scope.d', 'token-4', 'user-1', async () => 'retry', client),
    AlreadyProcessedError,
  )
})

test('cleanupExpiredIdempotencyKeys removes only expired rows', async () => {
  const { client, rows } = makeMemoryClient()
  // Add one expired and one fresh row directly to bypass the TTL math.
  rows.set('s::expired', {
    scope: 's',
    token: 'expired',
    userId: 'u',
    expiresAt: new Date(Date.now() - 60_000),
  })
  rows.set('s::fresh', {
    scope: 's',
    token: 'fresh',
    userId: 'u',
    expiresAt: new Date(Date.now() + 60_000),
  })
  const count = await cleanupExpiredIdempotencyKeys(client)
  assert.equal(count, 1)
  assert.ok(!rows.has('s::expired'))
  assert.ok(rows.has('s::fresh'))
})

test('non-P2002 errors propagate untouched', async () => {
  const failingClient: IdempotencyDbClient = {
    idempotencyKey: {
      create: async () => {
        throw new Error('connection refused')
      },
      deleteMany: async () => ({ count: 0 }),
    },
  }
  await assert.rejects(
    () =>
      withIdempotency('scope.e', 'token', 'user-1', async () => 'never', failingClient),
    /connection refused/,
  )
})

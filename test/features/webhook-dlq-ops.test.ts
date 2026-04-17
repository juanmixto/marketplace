import test from 'node:test'
import assert from 'node:assert/strict'
import {
  listDlqRows,
  countDlqRows,
  markDlqResolved,
  shouldAlertDlq,
  type WebhookDlqOpsClient,
} from '@/domains/payments/webhook-dlq-ops'

/**
 * Minimal in-memory mock that mimics just the `findMany` / `count` /
 * `update` surface the ops helpers touch. Keeping it local keeps the
 * test free of database setup.
 */
interface MockRow {
  id: string
  provider: string
  eventId: string | null
  eventType: string
  providerRef: string | null
  reason: string
  resolvedAt: Date | null
  resolvedBy: string | null
  createdAt: Date
}

function buildMockClient(rows: MockRow[]): WebhookDlqOpsClient {
  return {
    webhookDeadLetter: {
      async findMany(args: {
        where?: Record<string, unknown>
        orderBy?: { createdAt?: 'asc' | 'desc' }
        take?: number
      } = {}) {
        let out = rows.slice()
        const where = args.where ?? {}
        if ('resolvedAt' in where) {
          if (where.resolvedAt === null) {
            out = out.filter((r) => r.resolvedAt === null)
          }
        }
        if (typeof where.provider === 'string') {
          out = out.filter((r) => r.provider === where.provider)
        }
        if (typeof where.eventType === 'string') {
          out = out.filter((r) => r.eventType === where.eventType)
        }
        if (args.orderBy?.createdAt === 'desc') {
          out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        }
        if (typeof args.take === 'number') {
          out = out.slice(0, args.take)
        }
        return out
      },
      async count(args: { where?: Record<string, unknown> } = {}) {
        let out = rows.slice()
        const where = args.where ?? {}
        if ('resolvedAt' in where && where.resolvedAt === null) {
          out = out.filter((r) => r.resolvedAt === null)
        }
        if (
          where.createdAt &&
          typeof (where.createdAt as { gte?: Date }).gte !== 'undefined'
        ) {
          const since = (where.createdAt as { gte: Date }).gte
          out = out.filter((r) => r.createdAt.getTime() >= since.getTime())
        }
        return out.length
      },
      async update(args: { where: { id: string }; data: Partial<MockRow> }) {
        const row = rows.find((r) => r.id === args.where.id)
        if (!row) throw new Error(`row ${args.where.id} not found`)
        Object.assign(row, args.data)
        return row
      },
    },
  }
}

function seedRow(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: `row-${Math.random().toString(36).slice(2, 8)}`,
    provider: 'stripe',
    eventId: `evt_${Math.random().toString(36).slice(2, 8)}`,
    eventType: 'payment_intent.succeeded',
    providerRef: 'pi_x',
    reason: 'orphan event',
    resolvedAt: null,
    resolvedBy: null,
    createdAt: new Date(),
    ...overrides,
  }
}

// ── listDlqRows ──────────────────────────────────────────────────────────

test('listDlqRows: defaults to unresolved rows ordered DESC by createdAt', async () => {
  const now = Date.now()
  const client = buildMockClient([
    seedRow({ id: 'old', createdAt: new Date(now - 10_000), reason: 'old' }),
    seedRow({ id: 'new', createdAt: new Date(now - 1_000), reason: 'new' }),
    seedRow({
      id: 'resolved',
      resolvedAt: new Date(now - 100),
      resolvedBy: 'jane',
      reason: 'done',
    }),
  ])

  const rows = await listDlqRows(client)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].id, 'new')
  assert.equal(rows[1].id, 'old')
})

test('listDlqRows: includeResolved true surfaces resolved rows too', async () => {
  const client = buildMockClient([
    seedRow({ id: 'a' }),
    seedRow({ id: 'b', resolvedAt: new Date(), resolvedBy: 'jane' }),
  ])
  const rows = await listDlqRows(client, { includeResolved: true })
  assert.equal(rows.length, 2)
})

test('listDlqRows: filters by eventType and provider', async () => {
  const client = buildMockClient([
    seedRow({ id: 'a', eventType: 'payment_intent.succeeded' }),
    seedRow({ id: 'b', eventType: 'invoice.paid' }),
    seedRow({ id: 'c', eventType: 'invoice.paid', provider: 'other' }),
  ])

  const only = await listDlqRows(client, { eventType: 'invoice.paid' })
  assert.equal(only.length, 2)

  const onlyStripe = await listDlqRows(client, {
    eventType: 'invoice.paid',
    provider: 'stripe',
  })
  assert.equal(onlyStripe.length, 1)
  assert.equal(onlyStripe[0].id, 'b')
})

test('listDlqRows: limit clamps to [1, 500]', async () => {
  const client = buildMockClient(Array.from({ length: 20 }, () => seedRow()))
  assert.equal((await listDlqRows(client, { limit: 0 })).length, 1)
  assert.equal((await listDlqRows(client, { limit: 5 })).length, 5)
  assert.equal((await listDlqRows(client, { limit: 10_000 })).length, 20)
})

// ── countDlqRows ─────────────────────────────────────────────────────────

test('countDlqRows: total excludes resolved by default', async () => {
  const client = buildMockClient([
    seedRow(),
    seedRow(),
    seedRow({ resolvedAt: new Date(), resolvedBy: 'jane' }),
  ])

  const out = await countDlqRows(client)
  assert.equal(out.total, 2)
  // All rows just created, so recent also 2.
  assert.equal(out.recent, 2)
})

test('countDlqRows: recent uses the sinceMs window', async () => {
  const now = Date.now()
  const client = buildMockClient([
    seedRow({ createdAt: new Date(now - 1_000) }),
    seedRow({ createdAt: new Date(now - 1000 * 60 * 60 * 48) }), // 48h ago
  ])
  const out = await countDlqRows(client, { sinceMs: 24 * 60 * 60 * 1000 })
  assert.equal(out.total, 2)
  assert.equal(out.recent, 1)
  assert.equal(out.windowMs, 24 * 60 * 60 * 1000)
})

// ── markDlqResolved ──────────────────────────────────────────────────────

test('markDlqResolved: stamps resolvedAt and resolvedBy', async () => {
  const row = seedRow({ id: 'target' })
  const client = buildMockClient([row])

  await markDlqResolved(client, 'target', 'jane@example.com')

  assert.ok(row.resolvedAt instanceof Date, 'resolvedAt must be a Date')
  assert.equal(row.resolvedBy, 'jane@example.com')
})

// ── shouldAlertDlq ───────────────────────────────────────────────────────

test('shouldAlertDlq: fires when total meets threshold', () => {
  assert.equal(shouldAlertDlq({ total: 10, recent: 0 }), true)
  assert.equal(shouldAlertDlq({ total: 9, recent: 0 }), false)
})

test('shouldAlertDlq: fires when recent meets threshold independently', () => {
  assert.equal(shouldAlertDlq({ total: 0, recent: 3 }), true)
  assert.equal(shouldAlertDlq({ total: 0, recent: 2 }), false)
})

test('shouldAlertDlq: custom threshold is honoured', () => {
  assert.equal(
    shouldAlertDlq({ total: 5, recent: 0 }, { total: 5, recent: 100 }),
    true
  )
  assert.equal(
    shouldAlertDlq({ total: 4, recent: 0 }, { total: 5, recent: 100 }),
    false
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuditLog, extractAuditIp, readAuditPayload } from '@/lib/audit'

test('extractAuditIp prioritizes the first forwarded address', () => {
  const ip = extractAuditIp({
    get(name: string) {
      if (name === 'x-forwarded-for') return '203.0.113.10, 10.0.0.1'
      return null
    },
  })

  assert.equal(ip, '203.0.113.10')
})

test('extractAuditIp prefers cf-connecting-ip over x-forwarded-for (#540)', () => {
  // Behind Cloudflare → Traefik the XFF chain is "client, cf-edge-ip".
  // The leftmost entry is only trustworthy when the origin can't be
  // bypassed. cf-connecting-ip is filled by Cloudflare with the actual
  // client IP and any client-supplied copy is stripped — authoritative.
  const ip = extractAuditIp({
    get(name: string) {
      if (name === 'cf-connecting-ip') return '203.0.113.50'
      if (name === 'x-forwarded-for') return '198.51.100.77, 10.0.0.1'
      return null
    },
  })

  assert.equal(ip, '203.0.113.50')
})

test('extractAuditIp falls back to x-real-ip when forwarding chain is absent', () => {
  const ip = extractAuditIp({
    get(name: string) {
      if (name === 'x-real-ip') return '198.51.100.24'
      return null
    },
  })

  assert.equal(ip, '198.51.100.24')
})

test('extractAuditIp falls back to cf-connecting-ip when x-real-ip is absent', () => {
  const ip = extractAuditIp({
    get(name: string) {
      if (name === 'cf-connecting-ip') return '198.51.100.50'
      return null
    },
  })

  assert.equal(ip, '198.51.100.50')
})

test('extractAuditIp falls back to x-vercel-forwarded-for as last resort', () => {
  const ip = extractAuditIp({
    get(name: string) {
      if (name === 'x-vercel-forwarded-for') return '198.51.100.99'
      return null
    },
  })

  assert.equal(ip, '198.51.100.99')
})

test('extractAuditIp returns null when no IP headers are present', () => {
  const ip = extractAuditIp({ get: () => null })

  assert.equal(ip, null)
})

test('extractAuditIp handles x-forwarded-for with single IP', () => {
  const ip = extractAuditIp({
    get(name: string) {
      if (name === 'x-forwarded-for') return '10.0.0.5'
      return null
    },
  })

  assert.equal(ip, '10.0.0.5')
})

test('createAuditLog propagates persistence failures so callers roll back', async () => {
  // Contract flipped in #381: the helper used to swallow errors via
  // try/catch + console.error, which silently left a mutation
  // committed without a forensic trail. It now re-throws, so the
  // enclosing db.$transaction aborts the mutation and the operator
  // sees a loud failure instead of a missing audit row.
  let calls = 0
  await assert.rejects(
    () =>
      createAuditLog(
        {
          action: 'VENDOR_APPROVED',
          entityType: 'Vendor',
          entityId: 'vendor_1',
          before: { status: 'APPLYING' },
          after: { status: 'ACTIVE' },
          actorId: 'admin_1',
          actorRole: 'SUPERADMIN',
          ip: '127.0.0.1',
        },
        {
          auditLog: {
            async create() {
              calls += 1
              throw new Error('db offline')
            },
          },
        },
      ),
    /db offline/,
  )

  assert.equal(calls, 1)
})

test('createAuditLog writes the record when client is available', async () => {
  const written: unknown[] = []

  await createAuditLog(
    {
      action: 'PRODUCT_APPROVED',
      entityType: 'Product',
      entityId: 'prod_1',
      before: { status: 'PENDING_REVIEW' },
      after: { status: 'ACTIVE' },
      actorId: 'admin_2',
      actorRole: 'ADMIN_CATALOG',
      ip: '10.0.0.1',
    },
    {
      auditLog: {
        async create(args) {
          written.push(args.data)
          return {}
        },
      },
    }
  )

  assert.equal(written.length, 1)
  const record = written[0] as Record<string, unknown>
  assert.equal(record.action, 'PRODUCT_APPROVED')
  assert.equal(record.entityType, 'Product')
  assert.equal(record.entityId, 'prod_1')
  assert.equal(record.actorId, 'admin_2')
  assert.equal(record.actorRole, 'ADMIN_CATALOG')
  assert.equal(record.ip, '10.0.0.1')
})

test('createAuditLog defaults ip to null when not provided', async () => {
  const written: unknown[] = []

  await createAuditLog(
    {
      action: 'SETTINGS_UPDATED',
      entityType: 'Settings',
      entityId: 'settings_1',
      actorId: 'admin_3',
      actorRole: 'SUPERADMIN',
    },
    {
      auditLog: {
        async create(args) {
          written.push(args.data)
          return {}
        },
      },
    }
  )

  assert.equal(written.length, 1)
  const record = written[0] as Record<string, unknown>
  assert.equal(record.ip, null)
})

test('readAuditPayload returns typed before/after snapshots', () => {
  const payload = readAuditPayload<{ status: string }, { status: string; reviewer: string }>({
    before: { status: 'APPLYING' },
    after: { status: 'ACTIVE', reviewer: 'admin_1' },
  })

  assert.equal(payload.before?.status, 'APPLYING')
  assert.equal(payload.after?.status, 'ACTIVE')
  assert.equal(payload.after?.reviewer, 'admin_1')
})

test('readAuditPayload returns null for missing before/after fields', () => {
  const payload = readAuditPayload({ before: null, after: undefined })

  assert.equal(payload.before, null)
  assert.equal(payload.after, null)
})

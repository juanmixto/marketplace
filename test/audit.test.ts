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

test('extractAuditIp falls back to x-real-ip when forwarding chain is absent', () => {
  const ip = extractAuditIp({
    get(name: string) {
      if (name === 'x-real-ip') return '198.51.100.24'
      return null
    },
  })

  assert.equal(ip, '198.51.100.24')
})

test('createAuditLog swallows persistence failures so admin actions keep running', async () => {
  let calls = 0
  const originalConsoleError = console.error
  console.error = () => undefined

  try {
    await assert.doesNotReject(async () => {
      await createAuditLog(
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
        }
      )
    })
  } finally {
    console.error = originalConsoleError
  }

  assert.equal(calls, 1)
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

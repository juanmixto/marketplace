/**
 * #551: single-use, expiring tokens for the GDPR export email-link flow.
 *
 * Covers the three failure modes listed on the issue:
 *   - claim without prior request → invalid
 *   - double-claim → already_used
 *   - claim after TTL → expired
 */

import { describe, it, expect, beforeAll, afterAll } from '../test-helpers'
import { db } from '@/lib/db'
import {
  createAccountExportToken,
  consumeAccountExportToken,
} from '@/domains/auth/account-export-tokens'

describe('Account export tokens (#551)', () => {
  let userId: string

  beforeAll(async () => {
    const user = await db.user.create({
      data: {
        email: `export-token-${Date.now()}@example.com`,
        firstName: 'Export',
        lastName: 'Test',
        passwordHash: 'irrelevant',
        emailVerified: new Date(),
      },
    })
    userId = user.id
  })

  afterAll(async () => {
    await db.accountExportToken.deleteMany({ where: { userId } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  it('rejects a bogus token that was never issued', async () => {
    const result = await consumeAccountExportToken('nonsense')
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('invalid')
  })

  it('issues a token that consumes once and then reads as already_used', async () => {
    const token = await createAccountExportToken(userId)

    const first = await consumeAccountExportToken(token)
    expect(first.ok).toBe(true)
    expect(first.userId).toBe(userId)

    const second = await consumeAccountExportToken(token)
    expect(second.ok).toBe(false)
    expect(second.reason).toBe('already_used')
  })

  it('rejects an expired token', async () => {
    const token = await createAccountExportToken(userId)
    // Force the record into the past without waiting an hour.
    await db.accountExportToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const result = await consumeAccountExportToken(token)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('expired')
  })

  it('issuing a fresh token invalidates the previous one', async () => {
    const first = await createAccountExportToken(userId)
    const second = await createAccountExportToken(userId)

    const firstResult = await consumeAccountExportToken(first)
    expect(firstResult.ok).toBe(false)
    expect(firstResult.reason).toBe('invalid')

    const secondResult = await consumeAccountExportToken(second)
    expect(secondResult.ok).toBe(true)
  })
})

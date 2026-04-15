import { headers } from 'next/headers'
import type { Prisma } from '@/generated/prisma/client'

export type AuditValue = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput

export interface AuditPayload<TBefore = unknown, TAfter = TBefore> {
  before: TBefore | null
  after: TAfter | null
}

export interface AuditLogInput {
  action: string
  entityType: string
  entityId: string
  before?: AuditValue
  after?: AuditValue
  actorId: string
  actorRole: string
  ip?: string | null
}

interface AuditLogWriter {
  auditLog: {
    create(args: Prisma.AuditLogCreateArgs): Promise<unknown>
  }
}

export function extractAuditIp(headerStore: Pick<Headers, 'get'>) {
  const forwardedFor = headerStore.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  return (
    headerStore.get('x-real-ip')
    ?? headerStore.get('cf-connecting-ip')
    ?? headerStore.get('x-vercel-forwarded-for')
    ?? null
  )
}

/**
 * Resolve the request IP for audit logs.
 *
 * Refuses to record proxy-supplied headers unless the deployment is behind a
 * proxy we trust (#172). Recording a forged value would actively mislead a
 * forensic investigation, so when in doubt we record `null`.
 */
export async function getAuditRequestIp() {
  // Short-circuit before touching next/headers: the proxy-trust gate is the
  // real decision here, and calling `headers()` outside a request scope (in
  // integration tests, cron jobs, scripts) throws. Checking trust first
  // keeps the production path identical and unlocks test callers.
  if (!isProxyTrustedFromEnv()) {
    return null
  }
  const headerStore = await headers()
  return extractAuditIp(headerStore)
}

function isProxyTrustedFromEnv(): boolean {
  if (process.env.TRUST_PROXY_HEADERS === 'true') return true
  if (process.env.TRUST_PROXY_HEADERS === 'false') return false
  if (process.env.VERCEL === '1' || process.env.VERCEL === 'true') return true
  return false
}

export async function createAuditLog(
  input: AuditLogInput,
  client?: AuditLogWriter
) {
  try {
    const writer = client ?? await loadAuditClient()

    await writer.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before,
        after: input.after,
        actorId: input.actorId,
        actorRole: input.actorRole,
        ip: input.ip ?? null,
      },
    })
  } catch (error) {
    console.error('Failed to write audit log', {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error,
    })
  }
}

export function readAuditPayload<TBefore = unknown, TAfter = TBefore>(entry: {
  before: unknown
  after: unknown
}): AuditPayload<TBefore, TAfter> {
  return {
    before: (entry.before ?? null) as TBefore | null,
    after: (entry.after ?? null) as TAfter | null,
  }
}

async function loadAuditClient(): Promise<AuditLogWriter> {
  const { db } = await import('@/lib/db')
  return db
}

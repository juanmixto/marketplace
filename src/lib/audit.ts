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

/**
 * Runs a mutation callback inside a `db.$transaction` and persists the
 * resulting `AuditLog` row in the same transaction. If either the
 * mutation or the audit insert fails, both roll back. This is the
 * standard helper every admin server action should use when it
 * changes state that must be forensically tracked.
 *
 * Pattern (see src/domains/admin/actions.ts for real usages):
 *
 *   const ip = await getAuditRequestIp()
 *   const updated = await mutateWithAudit(async tx => {
 *     const u = await tx.vendor.update({ where: { id }, data: {...} })
 *     return {
 *       result: u,
 *       audit: { action, entityType, entityId, before, after, actorId, actorRole, ip },
 *     }
 *   })
 */
export async function mutateWithAudit<T>(
  mutation: (
    tx: Prisma.TransactionClient
  ) => Promise<{ result: T; audit: AuditLogInput }>
): Promise<T> {
  const { db } = await import('@/lib/db')
  return db.$transaction(async tx => {
    const { result, audit } = await mutation(tx)
    await createAuditLog(audit, tx)
    return result
  })
}

export function extractAuditIp(headerStore: Pick<Headers, 'get'>) {
  // Cloudflare is authoritative when present (#540). It strips any
  // client-supplied copy and fills this header with the actual client IP.
  // Under the CF → Traefik topology, x-forwarded-for's leftmost entry is
  // only reliable if the origin IP isn't bypassable — which is exactly
  // what we can't assume yet.
  const cfConnectingIp = headerStore.get('cf-connecting-ip')
  if (cfConnectingIp) return cfConnectingIp.trim()

  const forwardedFor = headerStore.get('x-forwarded-for')
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  return (
    headerStore.get('x-real-ip')
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

/**
 * Writes an AuditLog row.
 *
 * Expected to be called from inside a `db.$transaction(async tx => ...)`
 * callback with `tx` passed as the second argument. Doing so makes the
 * audit write atomic with the mutation that triggered it: if the audit
 * insert fails, the mutation rolls back. Without this guarantee the
 * forensic trail would have silent holes that compliance cannot
 * reconstruct from.
 *
 * Failures are deliberately NOT caught here. A DB-level audit error
 * must propagate out of the transaction so the caller's mutation
 * rolls back and the operator sees a loud failure. Previous fire-and-
 * forget semantics (try/catch + console.error) were removed in #381.
 */
export async function createAuditLog(
  input: AuditLogInput,
  client?: AuditLogWriter
) {
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

import { headers } from 'next/headers'
import type { Prisma } from '@/generated/prisma/client'

export type AuditValue = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput

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

export async function getAuditRequestIp() {
  const headerStore = await headers()
  return extractAuditIp(headerStore)
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

async function loadAuditClient(): Promise<AuditLogWriter> {
  const { db } = await import('@/lib/db')
  return db
}

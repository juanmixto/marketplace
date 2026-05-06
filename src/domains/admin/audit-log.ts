/**
 * Admin AuditLog reader (#1357, epic #1346 — PII pre-launch).
 *
 * `AuditLog` is append-only and already populated by the various
 * `mutateWithAudit` / `createAuditLog` call sites. This module is the
 * READ side: pagination + filters that drive the SUPERADMIN-only
 * `/admin/audit` view.
 *
 * The page is SUPERADMIN-gated because the table is the auditor of
 * admin behaviour itself. A regular admin watching their own audit
 * trail is the wrong threat model — the operator who's misbehaving
 * could just navigate to the page they're being audited on.
 *
 * `before` / `after` JSON columns are deep-scrubbed at read time via
 * `scrubPayload` (the unified scrubber from #1354). Even though every
 * writer is supposed to redact at write time, scrubbing on read is
 * cheap and means a forgotten field on the writer side doesn't leak
 * to a SUPERADMIN's UI either.
 */

import type { Prisma } from '@/generated/prisma/client'
import { db } from '@/lib/db'
import { scrubPayload } from '@/lib/scrubber'

export interface AdminAuditLogFilters {
  actorId?: string
  actorRole?: string
  entityType?: string
  action?: string
  /** ISO date strings, inclusive. */
  fromDate?: string
  toDate?: string
  page?: number
  pageSize?: number
}

export interface AdminAuditLogRow {
  id: string
  action: string
  entityType: string
  entityId: string
  actorId: string
  actorRole: string
  ip: string | null
  createdAt: string
  before: unknown
  after: unknown
}

export interface AdminAuditLogPage {
  rows: AdminAuditLogRow[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

const PAGE_SIZE_DEFAULT = 50
const PAGE_SIZE_MAX = 200

function parsePositive(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    return fallback
  }
  return Math.floor(value)
}

function buildWhere(filters: AdminAuditLogFilters): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {}
  if (filters.actorId) where.actorId = filters.actorId
  if (filters.actorRole) where.actorRole = filters.actorRole
  if (filters.entityType) where.entityType = filters.entityType
  if (filters.action) where.action = filters.action

  if (filters.fromDate || filters.toDate) {
    const range: Prisma.DateTimeFilter = {}
    if (filters.fromDate) {
      const d = new Date(filters.fromDate)
      if (!Number.isNaN(d.getTime())) range.gte = d
    }
    if (filters.toDate) {
      const d = new Date(filters.toDate)
      if (!Number.isNaN(d.getTime())) {
        // toDate inclusive: bump to end-of-day so the operator's
        // mental model "show me 2026-05-06's events" works.
        d.setUTCHours(23, 59, 59, 999)
        range.lte = d
      }
    }
    if (Object.keys(range).length > 0) where.createdAt = range
  }

  return where
}

export async function getAdminAuditLog(
  filters: AdminAuditLogFilters,
): Promise<AdminAuditLogPage> {
  const where = buildWhere(filters)
  const pageSize = Math.min(parsePositive(filters.pageSize, PAGE_SIZE_DEFAULT), PAGE_SIZE_MAX)
  const page = parsePositive(filters.page, 1)

  const [rawRows, totalCount] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    db.auditLog.count({ where }),
  ])

  const rows: AdminAuditLogRow[] = rawRows.map(r => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    actorId: r.actorId,
    actorRole: r.actorRole,
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
    // Defence in depth: writers are supposed to scrub but if a future
    // call site forgets, the read path still won't render PII.
    before: r.before === null ? null : scrubPayload(r.before),
    after: r.after === null ? null : scrubPayload(r.after),
  }))

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

/**
 * Distinct values for the filter dropdowns. Cheap on AuditLog because
 * `actorRole`, `entityType`, `action` are all low-cardinality.
 */
export async function getAdminAuditLogFacets(): Promise<{
  actorRoles: string[]
  entityTypes: string[]
  actions: string[]
}> {
  const [roles, entities, actions] = await Promise.all([
    db.auditLog.findMany({ distinct: ['actorRole'], select: { actorRole: true } }),
    db.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true } }),
    db.auditLog.findMany({ distinct: ['action'], select: { action: true } }),
  ])
  return {
    actorRoles: roles.map(r => r.actorRole).sort(),
    entityTypes: entities.map(e => e.entityType).sort(),
    actions: actions.map(a => a.action).sort(),
  }
}

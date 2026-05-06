import type { Metadata } from 'next'
import Link from 'next/link'
import { requireSuperadmin } from '@/lib/auth-guard'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import {
  getAdminAuditLog,
  getAdminAuditLogFacets,
} from '@/domains/admin/audit-log'

/**
 * #1357 — SUPERADMIN-only audit-log viewer.
 *
 * Reads `AuditLog` rows already populated by `mutateWithAudit` /
 * `createAuditLog` across the codebase. The page is the first read
 * surface on this table — pre-#1357 nothing in the UI consumed it,
 * so admins were watching admins blind.
 *
 * Filters are URL-driven (`searchParams`) so links can be deep-shared
 * during incident investigation. No client component — all rendering
 * server-side.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Audit log',
}

interface PageProps {
  searchParams: Promise<{
    actorId?: string
    actorRole?: string
    entityType?: string
    action?: string
    from?: string
    to?: string
    page?: string
  }>
}

function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? '1', 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs">
      <span className="text-[var(--muted)]">{label}:</span>
      <span className="font-mono">{value}</span>
    </span>
  )
}

export default async function AdminAuditLogPage({ searchParams }: PageProps) {
  // SUPERADMIN-only by design: the table audits admin behaviour and
  // a regular admin should not be the auditor of their own actions.
  await requireSuperadmin()

  const sp = await searchParams
  const filters = {
    actorId: sp.actorId?.trim() || undefined,
    actorRole: sp.actorRole?.trim() || undefined,
    entityType: sp.entityType?.trim() || undefined,
    action: sp.action?.trim() || undefined,
    fromDate: sp.from?.trim() || undefined,
    toDate: sp.to?.trim() || undefined,
    page: parsePage(sp.page),
    pageSize: 50,
  }

  const [data, facets] = await Promise.all([
    getAdminAuditLog(filters),
    getAdminAuditLogFacets(),
  ])

  function buildPageUrl(targetPage: number): string {
    const qs = new URLSearchParams()
    if (filters.actorId) qs.set('actorId', filters.actorId)
    if (filters.actorRole) qs.set('actorRole', filters.actorRole)
    if (filters.entityType) qs.set('entityType', filters.entityType)
    if (filters.action) qs.set('action', filters.action)
    if (filters.fromDate) qs.set('from', filters.fromDate)
    if (filters.toDate) qs.set('to', filters.toDate)
    qs.set('page', String(targetPage))
    return `/admin/audit?${qs.toString()}`
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          Pre-launch · SUPERADMIN
        </p>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Audit log</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Append-only forensic trail. <code>before</code> / <code>after</code>{' '}
          payloads are deep-scrubbed at render — even if a writer forgot to
          redact a field, the renderer won&apos;t leak it.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-[var(--foreground)]">Filters</h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            URL-driven — share the link with the on-call investigator.
          </p>
        </CardHeader>
        <CardBody>
          <form method="get" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              actorId
              <input
                type="text"
                name="actorId"
                defaultValue={filters.actorId ?? ''}
                placeholder="cuid…"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              actorRole
              <select
                name="actorRole"
                defaultValue={filters.actorRole ?? ''}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              >
                <option value="">— any —</option>
                {facets.actorRoles.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              entityType
              <select
                name="entityType"
                defaultValue={filters.entityType ?? ''}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              >
                <option value="">— any —</option>
                {facets.entityTypes.map(e => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              action
              <select
                name="action"
                defaultValue={filters.action ?? ''}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              >
                <option value="">— any —</option>
                {facets.actions.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              from
              <input
                type="date"
                name="from"
                defaultValue={filters.fromDate ?? ''}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
              to
              <input
                type="date"
                name="to"
                defaultValue={filters.toDate ?? ''}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]"
              />
            </label>
            <div className="flex items-end gap-2 lg:col-span-2">
              <button
                type="submit"
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Apply
              </button>
              <Link
                href="/admin/audit"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
              >
                Reset
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--foreground)]">Events</h2>
            <p className="text-xs text-[var(--muted)]">
              {data.totalCount} total · page {data.page} of {data.totalPages}
            </p>
          </div>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">when</th>
                <th className="px-3 py-2">action</th>
                <th className="px-3 py-2">entity</th>
                <th className="px-3 py-2">actor</th>
                <th className="px-3 py-2">ip</th>
                <th className="px-3 py-2">payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted)]">
                    No events match these filters.
                  </td>
                </tr>
              )}
              {data.rows.map(row => (
                <tr key={row.id} className="align-top">
                  <td className="px-3 py-2 font-mono text-xs text-[var(--foreground-soft)]">
                    {row.createdAt.replace('T', ' ').slice(0, 19)}Z
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{row.action}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <StatBadge label="type" value={row.entityType} />
                      <StatBadge label="id" value={row.entityId} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <StatBadge label="role" value={row.actorRole} />
                      <StatBadge label="id" value={row.actorId} />
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.ip ?? '—'}</td>
                  <td className="px-3 py-2">
                    <details className="text-xs">
                      <summary className="cursor-pointer text-[var(--muted)]">
                        before / after
                      </summary>
                      <pre className="mt-2 max-w-prose overflow-x-auto rounded-md bg-[var(--surface)] p-2 font-mono text-[10px] leading-tight">
{JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <nav className="flex items-center justify-between">
        <Link
          aria-disabled={data.page <= 1}
          href={data.page <= 1 ? '#' : buildPageUrl(data.page - 1)}
          className={
            'rounded-md border border-[var(--border)] px-3 py-1.5 text-sm '
            + (data.page <= 1
              ? 'pointer-events-none opacity-50'
              : 'bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]')
          }
        >
          ← Prev
        </Link>
        <p className="text-xs text-[var(--muted)]">
          page {data.page} / {data.totalPages}
        </p>
        <Link
          aria-disabled={data.page >= data.totalPages}
          href={data.page >= data.totalPages ? '#' : buildPageUrl(data.page + 1)}
          className={
            'rounded-md border border-[var(--border)] px-3 py-1.5 text-sm '
            + (data.page >= data.totalPages
              ? 'pointer-events-none opacity-50'
              : 'bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]')
          }
        >
          Next →
        </Link>
      </nav>
    </div>
  )
}

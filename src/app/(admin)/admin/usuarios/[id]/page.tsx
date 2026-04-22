import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeftIcon, ShieldCheckIcon } from '@heroicons/react/24/outline'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { AdminUserPasswordResetActions } from '@/components/admin/AdminUserPasswordResetActions'
import { AdminUserStateActions } from '@/components/admin/AdminUserStateActions'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { getAdminUserDetailData } from '@/domains/admin'
import { createAuditLog, getAuditRequestIp } from '@/lib/audit'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { canChangeAdminUserState, canResetAdminUserPassword } from '@/lib/roles'
import { getAdminUsersCopy } from '@/i18n/admin-users-copy'
import { formatMadridDate } from '@/lib/utils'
import { ADMIN_USERS_ROLE_LABELS, ADMIN_USERS_VENDOR_STATUS_LABELS } from '@/domains/admin/users/navigation'

export const revalidate = 30

export async function generateMetadata(): Promise<Metadata> {
  const copy = getAdminUsersCopy().detail
  return {
    title: copy.metadataTitle,
    description: copy.metadataDescription,
  }
}

interface PageProps {
  params: Promise<{ id: string }>
}

function toneForFlag(value: boolean) {
  return value ? ('emerald' as const) : ('slate' as const)
}

function toneForAvailability(value: boolean) {
  return value ? ('emerald' as const) : ('amber' as const)
}

function formatActivity(value: Date | null, noData: string) {
  return value
    ? formatMadridDate(value, { dateStyle: 'medium', timeStyle: 'short' })
    : noData
}

function formatAuditPayload(value: unknown) {
  if (!value) return '—'
  try {
    return JSON.stringify(value)
  } catch {
    return '—'
  }
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const copy = getAdminUsersCopy().detail
  const { id } = await params
  const detail = await getAdminUserDetailData(id).catch(() => null)
  if (!detail) {
    notFound()
  }

  const session = await auth()
  const canChangeState = session?.user ? canChangeAdminUserState(session.user.role) : false
  const canResetPassword = session?.user ? canResetAdminUserPassword(session.user.role) : false
  if (session?.user) {
    const ip = await getAuditRequestIp()
    await createAuditLog({
      action: 'ADMIN_USER_DETAIL_VIEWED',
      entityType: 'User',
      entityId: detail.user.id,
      after: { view: 'detail' },
      actorId: session.user.id,
      actorRole: session.user.role,
      ip,
    }).catch(error => {
      console.error('[admin-users][audit] detail view log failed', error)
    })
  }

  const auditLogs = await db.auditLog.findMany({
    where: {
      OR: [
        { entityType: 'User', entityId: detail.user.id },
        ...(detail.user.vendor ? [{ entityType: 'Vendor', entityId: detail.user.vendor.id }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 8,
  })

  const actorIds = Array.from(new Set(auditLogs.map(log => log.actorId)))
  const actors =
    actorIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : []
  const actorsById = new Map(actors.map(actor => [actor.id, actor]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Link
            href="/admin/usuarios"
            className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 transition hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {copy.backToList}
          </Link>
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{copy.eyebrow}</p>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {detail.user.firstName} {detail.user.lastName}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">{copy.titleBody}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-right text-sm text-[var(--muted)] shadow-sm">
          <p>{detail.user.email}</p>
          <p>{detail.user.id}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.accountTitle}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{copy.accountBody}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminStatusBadge
                label={detail.user.deletedAt ? copy.badges.deleted : detail.user.isActive ? copy.badges.active : copy.badges.inactive}
                tone={detail.user.deletedAt ? 'red' : detail.user.isActive ? 'emerald' : 'amber'}
              />
              <AdminStatusBadge
                label={detail.user.emailVerified ? copy.badges.emailVerified : copy.badges.emailPending}
                tone={detail.user.emailVerified ? 'emerald' : 'amber'}
              />
              <AdminStatusBadge
                label={detail.user.twoFactorEnabledAt ? copy.badges.twoFactorActive : copy.badges.twoFactorInactive}
                tone={toneForFlag(!!detail.user.twoFactorEnabledAt)}
              />
            </div>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <DetailRow label={copy.fields.name} value={`${detail.user.firstName} ${detail.user.lastName}`} />
            <DetailRow label={copy.fields.role} value={ADMIN_USERS_ROLE_LABELS[detail.user.role] ?? detail.user.role} />
            <DetailRow label={copy.fields.email} value={detail.user.email} secondary={detail.user.emailMasked} />
            <DetailRow label={copy.fields.emailVerified} value={detail.user.emailVerified ? formatMadridDate(detail.user.emailVerified, { dateStyle: 'medium', timeStyle: 'short' }) : copy.badges.emailPending} />
            <DetailRow label={copy.fields.joined} value={formatMadridDate(detail.user.createdAt, { dateStyle: 'medium', timeStyle: 'short' })} />
            <DetailRow label={copy.fields.updated} value={formatMadridDate(detail.user.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })} />
            <DetailRow label={copy.fields.lastLogin} value={formatActivity(detail.user.lastLoginAt, copy.activity.noData)} />
            <DetailRow label={copy.fields.lastActivity} value={formatActivity(detail.activity.lastActivityAt, copy.activity.noData)} />
            <DetailRow label={copy.fields.accountStatus} value={detail.user.deletedAt ? copy.badges.deleted : detail.user.isActive ? copy.badges.active : copy.badges.inactive} />
            <DetailRow
              label={copy.fields.twoFactor}
              value={detail.user.twoFactorEnabledAt ? copy.badges.twoFactorActive : copy.badges.twoFactorInactive}
              secondary={detail.user.twoFactorEnabledAt ? `${copy.since} ${formatMadridDate(detail.user.twoFactorEnabledAt, { dateStyle: 'medium', timeStyle: 'short' })}` : undefined}
            />
          </CardBody>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.actionsTitle}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{copy.actionsBody}</p>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-[var(--foreground-soft)]">{copy.actionsStatus}</span>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/40 p-4">
              <p className="text-sm font-medium text-[var(--foreground)]">{copy.quickAccessTitle}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{copy.quickAccessBody}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/admin/pedidos?q=${encodeURIComponent(detail.user.email)}`}
                  className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                >
                  {copy.quickAccess.orders}
                </Link>
                <Link
                  href={`/admin/auditoria?entityType=User`}
                  className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                >
                  {copy.quickAccess.auditUser}
                </Link>
                {detail.user.vendor && (
                  <>
                    <Link
                      href="/admin/productores"
                      className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                    >
                      {copy.quickAccess.producers}
                    </Link>
                    <Link
                      href={`/admin/auditoria?entityType=Vendor`}
                      className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium text-[var(--foreground-soft)] shadow-sm transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
                    >
                      {copy.quickAccess.auditVendor}
                    </Link>
                  </>
                )}
              </div>
            </div>

            {canResetPassword ? (
              <AdminUserPasswordResetActions
                userId={detail.user.id}
                email={detail.user.email}
                canReset={canResetPassword}
                isDeleted={!!detail.user.deletedAt}
              />
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/40 p-4">
                <p className="text-sm font-medium text-[var(--foreground)]">{copy.hiddenResetPasswordTitle}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{copy.hiddenResetPasswordBody}</p>
              </div>
            )}
            <ActionAvailability
              label={copy.sessionsTitle}
              available={true}
              description={copy.sessionsBody}
              availableLabel={copy.availability.available}
              unavailableLabel={copy.availability.unavailable}
            />
            <ActionAvailability
              label={copy.inlineEditTitle}
              available={false}
              description={copy.inlineEditBody}
              availableLabel={copy.availability.available}
              unavailableLabel={copy.availability.unavailable}
            />
            {canChangeState ? (
              <AdminUserStateActions
                userId={detail.user.id}
                email={detail.user.email}
                isActive={detail.user.isActive}
                isDeleted={!!detail.user.deletedAt}
                vendorStatus={detail.user.vendor?.status ?? null}
                canChangeState={canChangeState}
              />
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/40 p-4">
                <p className="text-sm font-medium text-[var(--foreground)]">{copy.hiddenStateTitle}</p>
                <p className="mt-1 text-sm text-[var(--muted)]">{copy.hiddenStateBody}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {detail.user.vendor && (
        <Card className="rounded-2xl">
          <CardHeader>
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.producerTitle}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{copy.producerBody}</p>
            </div>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailRow label={copy.producerFields.displayName} value={detail.user.vendor.displayName} />
            <DetailRow label={copy.producerFields.slug} value={detail.user.vendor.slug} />
            <DetailRow
              label={copy.producerFields.status}
              value={ADMIN_USERS_VENDOR_STATUS_LABELS[detail.user.vendor.status] ?? detail.user.vendor.status}
            />
            <DetailRow
              label={copy.producerFields.stripe}
              value={detail.user.vendor.stripeOnboarded ? copy.producerFields.yes : copy.producerFields.no}
              secondary={detail.user.vendor.preferredShippingProvider ?? copy.producerFields.noShippingProvider}
            />
          </CardBody>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{copy.auditTitle}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{copy.auditBody}</p>
          </div>
          <Link
            href="/admin/auditoria"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] shadow-sm transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          >
            {copy.openAudit}
          </Link>
        </CardHeader>
        <CardBody className="space-y-3">
          {auditLogs.length > 0 ? (
            auditLogs.map(log => {
              const actor = actorsById.get(log.actorId)
              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/50 p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--foreground)]">{log.action}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {log.entityType} · {formatMadridDate(log.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="text-right text-xs text-[var(--muted)]">
                      <p>{actor ? `${actor.firstName} ${actor.lastName}` : log.actorId}</p>
                      <p>{actor?.email ?? log.actorRole}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <AuditPayload label={copy.auditLabels.before} value={log.before} />
                    <AuditPayload label={copy.auditLabels.after} value={log.after} />
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-[var(--muted)]">{copy.auditEmptyBody}</p>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function DetailRow({
  label,
  value,
  secondary,
}: {
  label: string
  value: string
  secondary?: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-light)]">{label}</p>
      <p className="mt-1 font-medium text-[var(--foreground)]">{value}</p>
      {secondary && <p className="mt-1 text-xs text-[var(--muted)]">{secondary}</p>}
    </div>
  )
}

function ActionAvailability({
  label,
  available,
  description,
  availableLabel,
  unavailableLabel,
}: {
  label: string
  available: boolean
  description: string
  availableLabel: string
  unavailableLabel: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-[var(--foreground)]">{label}</p>
        <AdminStatusBadge
          label={available ? availableLabel : unavailableLabel}
          tone={toneForAvailability(available)}
        />
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]">{description}</p>
    </div>
  )
}

function AuditPayload({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-light)]">{label}</p>
      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-[var(--foreground-soft)]">
        {formatAuditPayload(value)}
      </pre>
    </div>
  )
}

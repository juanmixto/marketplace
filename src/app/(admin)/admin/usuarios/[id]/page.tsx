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
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Detalle de usuario | Admin' }
export const revalidate = 30

interface PageProps {
  params: Promise<{ id: string }>
}

function toneForFlag(value: boolean) {
  return value ? ('emerald' as const) : ('slate' as const)
}

function toneForAvailability(value: boolean) {
  return value ? ('emerald' as const) : ('amber' as const)
}

function formatActivity(value: Date | null) {
  return value
    ? formatDate(value, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Sin dato fiable todavía'
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
            Volver al listado
          </Link>
          <div>
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Ficha de soporte</p>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">
              {detail.user.firstName} {detail.user.lastName}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
              Vista consolidada de cuenta, productor, actividad y auditoría relevante para decisiones de soporte y operaciones.
            </p>
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
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Cuenta</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Identidad, verificación, 2FA y actividad visible para soporte.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AdminStatusBadge
                label={detail.user.deletedAt ? 'Eliminado' : detail.user.isActive ? 'Activa' : 'Inactiva'}
                tone={detail.user.deletedAt ? 'red' : detail.user.isActive ? 'emerald' : 'amber'}
              />
              <AdminStatusBadge
                label={detail.user.emailVerified ? 'Email verificado' : 'Email pendiente'}
                tone={detail.user.emailVerified ? 'emerald' : 'amber'}
              />
              <AdminStatusBadge
                label={detail.user.twoFactorEnabledAt ? '2FA activa' : '2FA no activada'}
                tone={toneForFlag(!!detail.user.twoFactorEnabledAt)}
              />
            </div>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <DetailRow label="Nombre" value={`${detail.user.firstName} ${detail.user.lastName}`} />
            <DetailRow label="Rol" value={detail.user.role} />
            <DetailRow label="Email" value={detail.user.email} secondary={detail.user.emailMasked} />
            <DetailRow label="Email verificado" value={detail.user.emailVerified ? formatDate(detail.user.emailVerified, { dateStyle: 'medium', timeStyle: 'short' }) : 'No verificado'} />
            <DetailRow label="Alta" value={formatDate(detail.user.createdAt, { dateStyle: 'medium', timeStyle: 'short' })} />
            <DetailRow label="Actualización" value={formatDate(detail.user.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })} />
            <DetailRow label="Último login" value={formatActivity(detail.user.lastLoginAt)} />
            <DetailRow label="Última actividad" value={formatActivity(detail.activity.lastActivityAt)} />
            <DetailRow label="Estado de la cuenta" value={detail.user.deletedAt ? 'Eliminada' : detail.user.isActive ? 'Activa' : 'Inactiva'} />
            <DetailRow
              label="2FA"
              value={detail.user.twoFactorEnabledAt ? 'Activada' : 'No activada'}
              secondary={detail.user.twoFactorEnabledAt ? `Desde ${formatDate(detail.user.twoFactorEnabledAt, { dateStyle: 'medium', timeStyle: 'short' })}` : undefined}
            />
          </CardBody>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Acciones</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Esta vista es solo lectura. Las acciones sensibles se habilitan en tickets posteriores.</p>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-medium text-[var(--foreground-soft)]">Sin mutaciones en V1</span>
            </div>
          </CardHeader>
          <CardBody className="space-y-3">
            {canResetPassword ? (
              <AdminUserPasswordResetActions
                userId={detail.user.id}
                email={detail.user.email}
                canReset={canResetPassword}
                isDeleted={!!detail.user.deletedAt}
              />
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/40 p-4">
                <p className="text-sm font-medium text-[var(--foreground)]">Reset password</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Solo `ADMIN_SUPPORT`, `ADMIN_OPS` y `SUPERADMIN` pueden solicitar el reset.
                </p>
              </div>
            )}
            <ActionAvailability
              label="Invalidar sesiones"
              available={true}
              description="Se revoca en servidor con authVersion cuando se bloquea o reestablece la cuenta."
            />
            <ActionAvailability
              label="Edición inline"
              available={false}
              description="Fuera de alcance para esta V1: la ficha es read-only."
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
                <p className="text-sm font-medium text-[var(--foreground)]">Bloquear / desbloquear</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Solo `ADMIN_OPS` y `SUPERADMIN` pueden cambiar el estado de esta cuenta.
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {detail.user.vendor && (
        <Card className="rounded-2xl">
          <CardHeader>
            <div>
              <h2 className="text-lg font-semibold text-[var(--foreground)]">Productor</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Contexto operativo del productor asociado a esta cuenta.</p>
            </div>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DetailRow label="Nombre comercial" value={detail.user.vendor.displayName} />
            <DetailRow label="Slug" value={detail.user.vendor.slug} />
            <DetailRow label="Estado" value={detail.user.vendor.status} />
            <DetailRow
              label="En Stripe"
              value={detail.user.vendor.stripeOnboarded ? 'Sí' : 'No'}
              secondary={detail.user.vendor.preferredShippingProvider ?? 'Proveedor de envío no definido'}
            />
          </CardBody>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Auditoría relevante</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Últimos eventos vinculados a esta cuenta o al productor asociado.</p>
          </div>
          <Link
            href="/admin/auditoria"
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--foreground-soft)] shadow-sm transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
          >
            Ver auditoría completa
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
                        {log.entityType} · {formatDate(log.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="text-right text-xs text-[var(--muted)]">
                      <p>{actor ? `${actor.firstName} ${actor.lastName}` : log.actorId}</p>
                      <p>{actor?.email ?? log.actorRole}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <AuditPayload label="Antes" value={log.before} />
                    <AuditPayload label="Después" value={log.after} />
                  </div>
                </div>
              )
            })
          ) : (
            <p className="text-sm text-[var(--muted)]">No hay eventos de auditoría recientes para esta cuenta.</p>
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
}: {
  label: string
  available: boolean
  description: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)]/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-[var(--foreground)]">{label}</p>
        <AdminStatusBadge label={available ? 'Disponible' : 'No disponible'} tone={toneForAvailability(available)} />
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

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Usuario | Admin' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

function roleLabel(role: string): string {
  switch (role) {
    case 'CUSTOMER':
      return 'Cliente'
    case 'VENDOR':
      return 'Vendedor'
    case 'ADMIN_SUPPORT':
      return 'Support'
    case 'ADMIN_CATALOG':
      return 'Catálogo'
    case 'ADMIN_FINANCE':
      return 'Finanzas'
    case 'ADMIN_OPS':
      return 'Ops'
    case 'SUPERADMIN':
      return 'Superadmin'
    default:
      return role
  }
}

function statusBadge(user: { isActive: boolean; deletedAt: Date | null }) {
  if (user.deletedAt) return <Badge variant="red">Eliminado</Badge>
  if (!user.isActive) return <Badge variant="amber">Inactivo</Badge>
  return <Badge variant="green">Activo</Badge>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-[var(--foreground)]">{value}</p>
    </div>
  )
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requireAdmin()

  const { id } = await params
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      image: true,
      role: true,
      isActive: true,
      deletedAt: true,
      emailVerified: true,
      consentAcceptedAt: true,
      stripeCustomerId: true,
      createdAt: true,
      updatedAt: true,
      vendor: { select: { id: true, slug: true, status: true } },
      twoFactor: { select: { enabledAt: true, createdAt: true } },
      _count: {
        select: {
          orders: true,
          addresses: true,
          sessions: true,
          notificationPreferences: true,
          notificationDeliveries: true,
          pushSubscriptions: true,
        },
      },
    },
  })

  if (!user) notFound()

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
        <CardHeader className="flex flex-col gap-4 border-b border-[var(--border)] bg-[var(--surface)] lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Link href="/admin/usuarios" className="inline-flex text-xs text-[var(--muted-foreground)] hover:underline">
              ← Volver a usuarios
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                Usuario
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                {user.firstName} {user.lastName}
              </h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{user.email}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{roleLabel(user.role)}</Badge>
              {statusBadge(user)}
              {user.vendor && <Badge variant="default">Tiene vendor</Badge>}
            </div>
          </div>

          <div className="grid min-w-[20rem] gap-2 sm:grid-cols-2">
            <MiniStat label="Alta" value={formatDate(user.createdAt)} />
            <MiniStat label="Actualizado" value={formatDate(user.updatedAt)} />
            <MiniStat label="Pedidos" value={String(user._count.orders)} />
            <MiniStat label="Sesiones" value={String(user._count.sessions)} />
          </div>
        </CardHeader>

        <CardBody className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">Estado de cuenta</p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Email verificado</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.emailVerified ? formatDate(user.emailVerified) : 'Pendiente'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Consentimiento</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.consentAcceptedAt ? formatDate(user.consentAcceptedAt) : 'No registrado'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Stripe customer</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.stripeCustomerId ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">2FA</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.twoFactor?.enabledAt ? `Activa desde ${formatDate(user.twoFactor.enabledAt)}` : 'No activa'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">Relaciones</p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Direcciones</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.addresses}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Push subs</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.pushSubscriptions}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Notificaciones</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.notificationPreferences}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Notific. entregadas</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.notificationDeliveries}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Vendor</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.vendor ? (
                      <Link href={`/admin/productores/${user.vendor.id}/edit`} className="hover:underline">
                        {user.vendor.slug} · {user.vendor.status}
                      </Link>
                    ) : (
                      'No tiene'
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">Datos básicos</p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-[var(--foreground)]">{user.id}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">Imagen</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-[var(--foreground)]">
                    {user.image ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
        </CardBody>
      </Card>
    </div>
  )
}

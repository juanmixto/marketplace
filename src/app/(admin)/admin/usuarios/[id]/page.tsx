import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-guard'
import { formatDate } from '@/lib/utils'
import { getServerLocale } from '@/i18n/server'
import { getAdminUsersCopy } from '@/i18n/admin-users-copy'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

function statusBadge(
  user: { isActive: boolean; deletedAt: Date | null },
  copy: ReturnType<typeof getAdminUsersCopy>['list']['statuses']
) {
  if (user.deletedAt) return <Badge variant="red">{copy.DELETED}</Badge>
  if (!user.isActive) return <Badge variant="amber">{copy.INACTIVE}</Badge>
  return <Badge variant="green">{copy.ACTIVE}</Badge>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-[var(--foreground)]">{value}</p>
    </div>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale()
  return { title: getAdminUsersCopy(locale).detail.metadataTitle }
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  await requireAdmin()
  const locale = await getServerLocale()
  const copy = getAdminUsersCopy(locale)
  const detail = copy.detail
  const list = copy.list

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
              {detail.back}
            </Link>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                {detail.eyebrow}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
                {user.firstName} {user.lastName}
              </h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">{user.email}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{list.roleLabels[user.role as keyof typeof list.roleLabels] ?? user.role}</Badge>
              {statusBadge(user, list.statuses)}
              {user.vendor && <Badge variant="default">{detail.states.hasVendor}</Badge>}
            </div>
          </div>

          <div className="grid min-w-[20rem] gap-2 sm:grid-cols-2">
            <MiniStat label={detail.labels.createdAt} value={formatDate(user.createdAt)} />
            <MiniStat label={detail.labels.updatedAt} value={formatDate(user.updatedAt)} />
            <MiniStat label={detail.labels.orders} value={String(user._count.orders)} />
            <MiniStat label={detail.labels.sessions} value={String(user._count.sessions)} />
          </div>
        </CardHeader>

        <CardBody className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">{detail.accountState}</p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.emailVerified}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.emailVerified ? formatDate(user.emailVerified) : detail.states.pending}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.consent}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.consentAcceptedAt ? formatDate(user.consentAcceptedAt) : detail.states.notRegistered}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.stripeCustomer}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.stripeCustomerId ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.twoFactor}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.twoFactor?.enabledAt
                      ? `${detail.states.twoFactorActiveSince} ${formatDate(user.twoFactor.enabledAt)}`
                      : detail.states.notActive}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">{detail.relationships}</p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.addresses}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.addresses}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.pushSubscriptions}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.pushSubscriptions}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.notificationPreferences}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.notificationPreferences}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.notificationDeliveries}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">{user._count.notificationDeliveries}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.vendor}</dt>
                  <dd className="mt-1 text-sm text-[var(--foreground)]">
                    {user.vendor ? (
                      <Link href={`/admin/productores/${user.vendor.id}/edit`} className="hover:underline">
                        {user.vendor.slug} · {user.vendor.status}
                      </Link>
                    ) : (
                      detail.states.noVendor
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">{detail.basicData}</p>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.id}</dt>
                  <dd className="mt-1 break-all font-mono text-xs text-[var(--foreground)]">{user.id}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">{detail.labels.image}</dt>
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

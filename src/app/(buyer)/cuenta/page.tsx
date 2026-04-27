import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BuildingStorefrontIcon, UserCircleIcon } from '@heroicons/react/24/outline'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import { SignOutButton } from '@/components/auth/SignOutButton'
import type { Metadata } from 'next'
import { buyerAccountItems, buyerAccountMeta } from '@/lib/navigation'
import { db } from '@/lib/db'
import { PendingReviewsBanner } from './PendingReviewsBanner'
import PushOptIn from '@/components/pwa/PushOptIn'
import { isPushEnabled } from '@/lib/pwa/push-config'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'
import { getPendingReviewsCount, getPendingOrderPlacedAtDates } from '@/domains/reviews/pending'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function CuentaPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const t = await getServerT()
  const [pendingReviews, pendingOrderDates] = await Promise.all([
    getPendingReviewsCount(session.user.id),
    getPendingOrderPlacedAtDates(session.user.id),
  ])
  const vendorApplication = await db.vendor.findUnique({
    where: { userId: session.user.id },
    select: { status: true },
  })

  const initial = session.user.name?.[0]?.toUpperCase() ?? '?'

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Avatar */}
      <div className="mb-8 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-emerald-600 text-2xl font-bold text-white shadow-sm shadow-emerald-950/10 dark:border-white/10 dark:bg-emerald-500 dark:text-gray-950">
          {initial}
        </div>
        <div>
          <p className="text-xl font-bold text-[var(--foreground)]">{session.user.name}</p>
          <p className="text-sm text-[var(--muted)]">{session.user.email}</p>
        </div>
      </div>

      <PendingReviewsBanner pendingCount={pendingReviews} pendingOrderDates={pendingOrderDates} />

      <BecomeVendorCard
        status={vendorApplication?.status ?? null}
        labels={{
          ctaTitle: t('account.becomeVendor.ctaTitle'),
          ctaDesc: t('account.becomeVendor.ctaDesc'),
          reviewTitle: t('account.becomeVendor.reviewTitle'),
          reviewDesc: t('account.becomeVendor.reviewDesc'),
        }}
      />

      <div className="space-y-2">
        {buyerAccountItems.map(({ href, available }) => {
          const meta = buyerAccountMeta[href as keyof typeof buyerAccountMeta]
          const Icon = meta?.icon ?? UserCircleIcon
          const label = t(meta.labelKey as TranslationKeys)
          const desc = t(meta.descKey as TranslationKeys)

          if (!available) {
            return (
              <div
                key={href}
                className="flex items-center gap-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-raised)] p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface)]">
                  <Icon className="h-5 w-5 text-[var(--muted)]" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-[var(--foreground-soft)]">{label}</p>
                  <p className="text-sm text-[var(--muted)]">{desc}</p>
                </div>
                <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
                  {t('account.comingSoon')}
                </span>
              </div>
            )
          }

          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition hover:border-emerald-300 hover:shadow-sm dark:hover:border-emerald-700"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-raised)]">
                <Icon className="h-5 w-5 text-[var(--foreground-soft)]" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--foreground)]">{label}</p>
                <p className="text-sm text-[var(--muted)]">{desc}</p>
              </div>
              <ChevronRightIcon className="h-5 w-5 text-[var(--muted)]" />
            </Link>
          )
        })}
      </div>

      {/* PWA — push notifications opt-in. Renders nothing when VAPID
          is not configured on this instance. */}
      {isPushEnabled && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('account.push.title')}</h2>
          <p className="text-sm text-[var(--muted)]">{t('account.push.desc')}</p>
          <PushOptIn />
        </div>
      )}

      <div className="mt-6">
        <SignOutButton />
      </div>
    </div>
  )
}

interface BecomeVendorCardProps {
  status: string | null
  labels: { ctaTitle: string; ctaDesc: string; reviewTitle: string; reviewDesc: string }
}

function BecomeVendorCard({ status, labels }: BecomeVendorCardProps) {
  if (status === 'ACTIVE') return null

  if (status === 'APPLYING' || status === 'PENDING_DOCS') {
    return (
      <Link
        href="/cuenta/hazte-vendedor"
        className="mb-4 flex items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300 hover:shadow-sm dark:border-amber-800/60 dark:bg-amber-950/30 dark:hover:border-amber-700"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300">
          <BuildingStorefrontIcon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-amber-900 dark:text-amber-100">{labels.reviewTitle}</p>
          <p className="text-sm text-amber-800/80 dark:text-amber-200/80">{labels.reviewDesc}</p>
        </div>
        <ChevronRightIcon className="h-5 w-5 text-amber-700/60 dark:text-amber-300/60" />
      </Link>
    )
  }

  return (
    <Link
      href="/cuenta/hazte-vendedor"
      className="mb-4 flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 transition hover:border-emerald-300 hover:shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:hover:border-emerald-700"
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/60 dark:text-emerald-300">
        <BuildingStorefrontIcon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <p className="font-medium text-emerald-900 dark:text-emerald-100">{labels.ctaTitle}</p>
        <p className="text-sm text-emerald-800/80 dark:text-emerald-200/80">{labels.ctaDesc}</p>
      </div>
      <ChevronRightIcon className="h-5 w-5 text-emerald-700/60 dark:text-emerald-300/60" />
    </Link>
  )
}

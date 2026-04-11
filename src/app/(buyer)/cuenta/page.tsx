import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserCircleIcon } from '@heroicons/react/24/outline'
import { ChevronRightIcon } from '@heroicons/react/20/solid'
import { SignOutButton } from '@/components/auth/SignOutButton'
import type { Metadata } from 'next'
import { buyerAccountItems, buyerAccountMeta } from '@/lib/navigation'
import { GDPRActions } from './GDPRActions'
import { getServerT } from '@/i18n/server'
import type { TranslationKeys } from '@/i18n/locales'

export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function CuentaPage() {
  const session = await auth()
  if (!session) redirect('/login')

  const t = await getServerT()

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

      {/* GDPR Privacy Section */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">{t('account.gdpr.title')}</h2>
        <p className="text-sm text-[var(--muted)]">{t('account.gdpr.desc')}</p>
        <GDPRActions />
      </div>

      <div className="mt-6">
        <SignOutButton />
      </div>
    </div>
  )
}

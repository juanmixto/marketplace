'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  HomeIcon, ShoppingBagIcon, ArchiveBoxIcon, UserCircleIcon,
  CurrencyEuroIcon, StarIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

const STORAGE_PREFIX = 'vendor-welcome-seen-v1:'

interface Step {
  titleKey: TranslationKeys
  bodyKey: TranslationKeys
  Icon: React.ComponentType<{ className?: string }>
}

const STEPS: Step[] = [
  { titleKey: 'vendor.welcome.step1.title', bodyKey: 'vendor.welcome.step1.body', Icon: HomeIcon },
  { titleKey: 'vendor.welcome.step2.title', bodyKey: 'vendor.welcome.step2.body', Icon: ArchiveBoxIcon },
  { titleKey: 'vendor.welcome.step3.title', bodyKey: 'vendor.welcome.step3.body', Icon: ShoppingBagIcon },
  { titleKey: 'vendor.welcome.step4.title', bodyKey: 'vendor.welcome.step4.body', Icon: UserCircleIcon },
  { titleKey: 'vendor.welcome.step5.title', bodyKey: 'vendor.welcome.step5.body', Icon: CurrencyEuroIcon },
  { titleKey: 'vendor.welcome.step6.title', bodyKey: 'vendor.welcome.step6.body', Icon: StarIcon },
]

const TOTAL = STEPS.length + 1

interface Props {
  vendorId: string
  vendorName: string
}

export function VendorWelcomeTour({ vendorId, vendorName }: Props) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    try {
      const key = STORAGE_PREFIX + vendorId
      if (!window.localStorage.getItem(key)) setOpen(true)
    } catch {}
  }, [vendorId])

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + vendorId, new Date().toISOString())
    } catch {}
    setOpen(false)
  }

  if (!open) return null

  const isFirst = index === 0
  const isLast = index === TOTAL - 1
  const step = isFirst ? null : STEPS[index - 1]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-welcome-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={dismiss}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label={t('vendor.welcome.skip')}
          className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        {isFirst ? (
          <div className="space-y-2 pr-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t('vendor.welcome.badge')}
            </p>
            <h2 id="vendor-welcome-title" className="text-2xl font-bold text-[var(--foreground)]">
              {t('vendor.welcome.intro.title').replace('{name}', vendorName)}
            </h2>
            <p className="text-sm text-[var(--muted)]">{t('vendor.welcome.intro.body')}</p>
          </div>
        ) : (
          step && (
            <div className="space-y-3 pr-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <step.Icon className="h-6 w-6" />
              </div>
              <p className="text-xs font-medium text-[var(--muted)]">
                {index} / {TOTAL - 1}
              </p>
              <h2 id="vendor-welcome-title" className="text-xl font-bold text-[var(--foreground)]">
                {t(step.titleKey)}
              </h2>
              <p className="text-sm text-[var(--muted)]">{t(step.bodyKey)}</p>
            </div>
          )
        )}

        <div className="mt-6 flex items-center gap-1.5" aria-hidden="true">
          {Array.from({ length: TOTAL }).map((_, i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? 'w-8 bg-emerald-500'
                  : i < index
                    ? 'w-2 bg-emerald-500/60'
                    : 'w-2 bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            {t('vendor.welcome.skip')}
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setIndex(i => i - 1)}
                className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]"
              >
                {t('vendor.welcome.back')}
              </button>
            )}
            {isLast ? (
              <Link
                href="/vendor/perfil"
                onClick={dismiss}
                className="inline-flex min-h-11 items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
              >
                {t('vendor.welcome.finish')}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setIndex(i => i + 1)}
                className="min-h-11 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400"
              >
                {t('vendor.welcome.next')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

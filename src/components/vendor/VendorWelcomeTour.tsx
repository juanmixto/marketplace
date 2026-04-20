'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  HomeIcon, ShoppingBagIcon, ArchiveBoxIcon, UserCircleIcon,
  CurrencyEuroIcon, StarIcon, XMarkIcon, SparklesIcon,
} from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

const STORAGE_PREFIX = 'vendor-welcome-seen-v2:'
const QUERY_PARAM = 'tour'

interface Step {
  path: string
  titleKey: TranslationKeys
  bodyKey: TranslationKeys
  Icon: React.ComponentType<{ className?: string }>
  emoji: string
}

// Step 0 is the intro shown over /vendor/dashboard.
// Steps 1..N each navigate to their own section so the modal sits
// on top of the real UI the vendor will use.
const STEPS: Step[] = [
  { path: '/vendor/dashboard',     titleKey: 'vendor.welcome.intro.title',  bodyKey: 'vendor.welcome.intro.body',  Icon: SparklesIcon,     emoji: '🎉' },
  { path: '/vendor/dashboard',     titleKey: 'vendor.welcome.step1.title',  bodyKey: 'vendor.welcome.step1.body',  Icon: HomeIcon,         emoji: '🏡' },
  { path: '/vendor/productos',     titleKey: 'vendor.welcome.step2.title',  bodyKey: 'vendor.welcome.step2.body',  Icon: ArchiveBoxIcon,   emoji: '🌱' },
  { path: '/vendor/pedidos',       titleKey: 'vendor.welcome.step3.title',  bodyKey: 'vendor.welcome.step3.body',  Icon: ShoppingBagIcon,  emoji: '📦' },
  { path: '/vendor/liquidaciones', titleKey: 'vendor.welcome.step4.title',  bodyKey: 'vendor.welcome.step4.body',  Icon: CurrencyEuroIcon, emoji: '💰' },
  { path: '/vendor/valoraciones',  titleKey: 'vendor.welcome.step5.title',  bodyKey: 'vendor.welcome.step5.body',  Icon: StarIcon,         emoji: '⭐' },
  { path: '/vendor/perfil',        titleKey: 'vendor.welcome.step6.title',  bodyKey: 'vendor.welcome.step6.body',  Icon: UserCircleIcon,   emoji: '✨' },
]

interface Props {
  vendorId: string
  vendorName: string
}

export function VendorWelcomeTour({ vendorId, vendorName }: Props) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)

  const tourParam = searchParams.get(QUERY_PARAM)
  const index = tourParam === null ? -1 : Math.max(0, Math.min(STEPS.length - 1, Number(tourParam) | 0))
  const open = index >= 0

  // Auto-start on first vendor dashboard visit.
  useEffect(() => {
    setMounted(true)
    if (pathname !== '/vendor/dashboard') return
    if (tourParam !== null) return
    try {
      if (window.localStorage.getItem(STORAGE_PREFIX + vendorId)) return
    } catch { return }
    const params = new URLSearchParams(searchParams.toString())
    params.set(QUERY_PARAM, '0')
    router.replace(`/vendor/dashboard?${params.toString()}`, { scroll: false })
    // Intentionally run once after mount; deps included to satisfy hook rules.
  }, [pathname, tourParam, vendorId, router, searchParams])

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + vendorId, new Date().toISOString())
    } catch {}
  }, [vendorId])

  const clearTourParam = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(QUERY_PARAM)
    const q = params.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }, [pathname, router, searchParams])

  const goToStep = useCallback((nextIndex: number) => {
    const next = STEPS[nextIndex]
    if (!next) return
    const params = new URLSearchParams(searchParams.toString())
    params.set(QUERY_PARAM, String(nextIndex))
    router.push(`${next.path}?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  const dismiss = useCallback(() => {
    markSeen()
    clearTourParam()
  }, [markSeen, clearTourParam])

  const finish = useCallback(() => {
    markSeen()
    const params = new URLSearchParams(searchParams.toString())
    params.delete(QUERY_PARAM)
    const q = params.toString()
    router.push(q ? `/vendor/perfil?${q}` : '/vendor/perfil', { scroll: false })
  }, [markSeen, router, searchParams])

  if (!mounted || !open) return null
  const step = STEPS[index]
  if (!step) return null

  const isFirst = index === 0
  const isLast = index === STEPS.length - 1
  const total = STEPS.length - 1 // progress shown as N/6 (excluding intro)

  // All steps — including the intro — live in the bottom-right corner
  // (bottom full-width on mobile) with no backdrop so the vendor can see
  // the actual UI the tour is describing from the very first frame.
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="vendor-welcome-title"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center sm:inset-auto sm:bottom-6 sm:right-6 sm:justify-end p-4 sm:p-0"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="pointer-events-auto relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
      >
        {/* Warm gradient header */}
        <div className="relative bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 p-6 pb-8 text-white">
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('vendor.welcome.skip')}
            className="absolute right-3 top-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-white/80 hover:bg-white/15 hover:text-white transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-3xl backdrop-blur-sm ring-1 ring-white/30">
              <span aria-hidden="true">{step.emoji}</span>
            </div>
            <div className="min-w-0">
              {!isFirst && (
                <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                  {t('vendor.welcome.stepCounter').replace('{current}', String(index)).replace('{total}', String(total))}
                </p>
              )}
              <h2 id="vendor-welcome-title" className="text-xl sm:text-2xl font-bold leading-tight">
                {isFirst
                  ? t(step.titleKey).replace('{name}', vendorName)
                  : t(step.titleKey)}
              </h2>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm sm:text-base leading-relaxed text-[var(--foreground-soft)]">
            {t(step.bodyKey)}
          </p>

          <div className="flex items-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${
                  i === index
                    ? 'w-8 bg-emerald-500'
                    : i < index
                      ? 'w-2 bg-emerald-500/60'
                      : 'w-2 bg-[var(--border)]'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={dismiss}
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {t('vendor.welcome.skip')}
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => goToStep(index - 1)}
                  className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] transition-colors"
                >
                  {t('vendor.welcome.back')}
                </button>
              )}
              {isLast ? (
                <button
                  type="button"
                  onClick={finish}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 transition-colors"
                >
                  {t('vendor.welcome.finish')}
                  <span aria-hidden="true">→</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => goToStep(index + 1)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-500 dark:text-gray-950 dark:hover:bg-emerald-400 transition-colors"
                >
                  {isFirst ? t('vendor.welcome.start') : t('vendor.welcome.next')}
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

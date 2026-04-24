'use client'

import { useEffect, useState, useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  HomeIcon, ShoppingBagIcon, ArchiveBoxIcon, UserGroupIcon,
  CurrencyEuroIcon, XMarkIcon, SparklesIcon, IdentificationIcon,
} from '@heroicons/react/24/outline'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

const STORAGE_PREFIX = 'admin-welcome-seen-v1:'
const QUERY_PARAM = 'admin_tour'

interface Step {
  path: string
  titleKey: TranslationKeys
  bodyKey: TranslationKeys
  Icon: React.ComponentType<{ className?: string }>
  emoji: string
}

const STEPS: Step[] = [
  { path: '/admin/dashboard',    titleKey: 'admin.welcome.intro.title',    bodyKey: 'admin.welcome.intro.body',    Icon: SparklesIcon,       emoji: '🛠️' },
  { path: '/admin/dashboard',    titleKey: 'admin.welcome.step1.title',    bodyKey: 'admin.welcome.step1.body',    Icon: HomeIcon,           emoji: '📊' },
  { path: '/admin/productores',  titleKey: 'admin.welcome.step2.title',    bodyKey: 'admin.welcome.step2.body',    Icon: UserGroupIcon,      emoji: '👥' },
  { path: '/admin/productos',    titleKey: 'admin.welcome.step3.title',    bodyKey: 'admin.welcome.step3.body',    Icon: ArchiveBoxIcon,     emoji: '✅' },
  { path: '/admin/pedidos',      titleKey: 'admin.welcome.step4.title',    bodyKey: 'admin.welcome.step4.body',    Icon: ShoppingBagIcon,    emoji: '📦' },
  { path: '/admin/comisiones',   titleKey: 'admin.welcome.step5.title',    bodyKey: 'admin.welcome.step5.body',    Icon: CurrencyEuroIcon,   emoji: '💶' },
  { path: '/admin/productores',  titleKey: 'admin.welcome.step6.title',    bodyKey: 'admin.welcome.step6.body',    Icon: IdentificationIcon, emoji: '🕵️' },
]

interface Props {
  adminId: string
  adminName: string
}

export function AdminWelcomeTour({ adminId, adminName }: Props) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)

  const tourParam = searchParams.get(QUERY_PARAM)
  const index = tourParam === null ? -1 : Math.max(0, Math.min(STEPS.length - 1, Number(tourParam) | 0))
  const open = index >= 0

  useEffect(() => {
    setMounted(true)
    if (pathname !== '/admin/dashboard') return
    if (tourParam !== null) return
    try {
      if (window.localStorage.getItem(STORAGE_PREFIX + adminId)) return
    } catch { return }
    const params = new URLSearchParams(searchParams.toString())
    params.set(QUERY_PARAM, '0')
    router.replace(`/admin/dashboard?${params.toString()}`, { scroll: false })
  }, [pathname, tourParam, adminId, router, searchParams])

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_PREFIX + adminId, new Date().toISOString())
    } catch {}
  }, [adminId])

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
    clearTourParam()
  }, [markSeen, clearTourParam])

  if (!mounted || !open) return null
  const step = STEPS[index]
  if (!step) return null

  const isFirst = index === 0
  const isLast = index === STEPS.length - 1
  const total = STEPS.length - 1

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="admin-welcome-title"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center sm:inset-auto sm:bottom-6 sm:right-6 sm:justify-end p-4 sm:p-0"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="pointer-events-auto relative w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden"
      >
        <div className="relative bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 p-6 pb-8 text-white">
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('admin.welcome.skip')}
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
                  {t('admin.welcome.stepCounter').replace('{current}', String(index)).replace('{total}', String(total))}
                </p>
              )}
              <h2 id="admin-welcome-title" className="text-xl sm:text-2xl font-bold leading-tight">
                {isFirst ? t(step.titleKey).replace('{name}', adminName) : t(step.titleKey)}
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
                    ? 'w-8 bg-indigo-500'
                    : i < index
                      ? 'w-2 bg-indigo-500/60'
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
              {t('admin.welcome.skip')}
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => goToStep(index - 1)}
                  className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] transition-colors"
                >
                  {t('admin.welcome.back')}
                </button>
              )}
              {isLast ? (
                <button
                  type="button"
                  onClick={finish}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
                >
                  {t('admin.welcome.finish')}
                  <span aria-hidden="true">✓</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => goToStep(index + 1)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
                >
                  {isFirst ? t('admin.welcome.start') : t('admin.welcome.next')}
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

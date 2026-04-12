'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { useLocale } from '@/i18n'
import type { CategoryWithCount } from '@/domains/catalog/types'
import { CERTIFICATIONS } from '@/lib/constants'
import { translateCategoryLabel } from '@/lib/portals'
import { getCatalogCopy, getLocalizedCertificationCopy } from '@/i18n/catalog-copy'
import { Tooltip } from '@/components/ui/tooltip'
import { CheckIcon } from '@heroicons/react/20/solid'
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

const CERT_CHIP_CLASSES: Record<string, { active: string; inactive: string }> = {
  'ECO-ES': {
    active:   'border-emerald-400 bg-emerald-100 text-emerald-900 ring-emerald-400/40 dark:border-emerald-500/70 dark:bg-emerald-900/50 dark:text-emerald-200',
    inactive: 'border-emerald-200/70 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300/80 dark:hover:bg-emerald-900/40',
  },
  DOP: {
    active:   'border-blue-400 bg-blue-100 text-blue-900 ring-blue-400/40 dark:border-blue-500/70 dark:bg-blue-900/50 dark:text-blue-200',
    inactive: 'border-blue-200/70 bg-blue-50/60 text-blue-700 hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300/80 dark:hover:bg-blue-900/40',
  },
  IGP: {
    active:   'border-amber-400 bg-amber-100 text-amber-900 ring-amber-400/40 dark:border-amber-500/70 dark:bg-amber-900/50 dark:text-amber-200',
    inactive: 'border-amber-200/70 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300/80 dark:hover:bg-amber-900/40',
  },
  BIO: {
    active:   'border-lime-400 bg-lime-100 text-lime-900 ring-lime-400/40 dark:border-lime-500/70 dark:bg-lime-900/50 dark:text-lime-200',
    inactive: 'border-lime-200/70 bg-lime-50/60 text-lime-700 hover:bg-lime-100 dark:border-lime-900/50 dark:bg-lime-950/30 dark:text-lime-300/80 dark:hover:bg-lime-900/40',
  },
  KM0: {
    active:   'border-purple-400 bg-purple-100 text-purple-900 ring-purple-400/40 dark:border-purple-500/70 dark:bg-purple-900/50 dark:text-purple-200',
    inactive: 'border-purple-200/70 bg-purple-50/60 text-purple-700 hover:bg-purple-100 dark:border-purple-900/50 dark:bg-purple-950/30 dark:text-purple-300/80 dark:hover:bg-purple-900/40',
  },
}

const CERT_CHIP_FALLBACK = {
  active:   'border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--foreground)] ring-emerald-400/30',
  inactive: 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]',
}

interface Props {
  categories: CategoryWithCount[]
  onClose?: () => void
}

export function ProductFiltersPanel({ categories, onClose }: Props) {
  const { locale } = useLocale()
  const copy = getCatalogCopy(locale)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback((key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null) p.delete(key)
    else p.set(key, value)
    p.delete('pagina')
    router.push(`${pathname}?${p.toString()}`)
    onClose?.()
  }, [router, pathname, searchParams, onClose])

  const toggleCert = (cert: string) => {
    const current = searchParams.getAll('cert')
    const p = new URLSearchParams(searchParams.toString())
    p.delete('cert')
    if (current.includes(cert)) {
      current.filter(c => c !== cert).forEach(c => p.append('cert', c))
    } else {
      [...current, cert].forEach(c => p.append('cert', c))
    }
    p.delete('pagina')
    router.push(`${pathname}?${p.toString()}`)
    onClose?.()
  }

  const currentCat   = searchParams.get('categoria')
  const currentCerts = searchParams.getAll('cert')
  const hasFilters   = currentCat || currentCerts.length > 0

  return (
    <div className="sticky top-24 space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
          <AdjustmentsHorizontalIcon className="h-4 w-4 text-[var(--muted)]" />
          {copy.filters.title}
        </h3>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              router.push(pathname)
              onClose?.()
            }}
            aria-label={copy.filters.clearAllAria}
            className="rounded-md text-xs text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
          >
            {copy.filters.clearAll}
          </button>
        )}
      </div>

      {/* Categories */}
      <div>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{copy.filters.category}</h4>
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => setParam('categoria', null)}
            aria-pressed={!currentCat}
            className={cn(
              'w-full rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset',
              !currentCat
                ? 'border border-emerald-200 bg-emerald-50 font-medium text-emerald-800 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
            )}
          >
            {copy.filters.all}
          </button>
          {categories.map(cat => {
            const count = cat._count.products
            const isEmpty = count === 0
            const isActive = currentCat === cat.slug
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => setParam('categoria', isActive ? null : cat.slug)}
                aria-pressed={isActive}
                disabled={isEmpty && !isActive}
                className={cn(
                  'group/cat flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset',
                  isActive
                    ? 'border border-emerald-200 bg-emerald-50 font-medium text-emerald-800 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : isEmpty
                      ? 'cursor-not-allowed text-[var(--muted)] opacity-60'
                      : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 flex-none items-center justify-center rounded-xl border text-base transition-colors',
                    isActive
                      ? 'border-emerald-300 bg-white shadow-sm dark:border-emerald-700 dark:bg-emerald-950'
                      : 'border-[var(--border)] bg-[var(--surface-raised)] group-hover/cat:border-emerald-300 dark:group-hover/cat:border-emerald-800'
                  )}
                  aria-hidden="true"
                >
                  {cat.icon || '🏷️'}
                </span>
                <span className="flex-1 truncate">
                  {translateCategoryLabel(cat.slug, cat.name, locale)}
                </span>
                <span
                  className={cn(
                    'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                    isActive
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                      : 'bg-[var(--surface-raised)] text-[var(--muted)]'
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Certifications */}
      <div>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{copy.filters.certifications}</h4>
        <div className="flex flex-wrap gap-2">
          {CERTIFICATIONS.map(cert => {
            const isActive = currentCerts.includes(cert)
            const styles = CERT_CHIP_CLASSES[cert] ?? CERT_CHIP_FALLBACK
            const certCopy = getLocalizedCertificationCopy(cert, locale)
            return (
              <Tooltip key={cert} content={certCopy.description || certCopy.label} side="top">
                <button
                  type="button"
                  onClick={() => toggleCert(cert)}
                  aria-pressed={isActive}
                  aria-label={certCopy.label}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30',
                    isActive ? `${styles.active} ring-2` : styles.inactive
                  )}
                >
                  {isActive && <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {cert}
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>
    </div>
  )
}

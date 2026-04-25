'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import { useLocale } from '@/i18n'
import type { BadgeVariant, CategoryWithCount } from '@/domains/catalog/types'
import { CERTIFICATIONS } from '@/lib/constants'
import { translateCategoryLabel } from '@/lib/portals'
import { getCatalogCopy, getLocalizedCertificationCopy } from '@/i18n/catalog-copy'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { trackAnalyticsEvent } from '@/lib/analytics'

const CERT_COLORS: Record<string, BadgeVariant> = {
  'ECO-ES': 'green',
  DOP: 'blue',
  KM0: 'purple',
  BIO: 'green',
  IGP: 'amber',
}

const CERT_SWATCH: Record<BadgeVariant, string> = {
  default: 'bg-[var(--surface-raised)] text-[var(--foreground-soft)] ring-1 ring-[var(--border)]',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  outline: 'border border-[var(--border-strong)] text-[var(--muted)]',
}

interface Props {
  categories: CategoryWithCount[]
  onClose?: () => void
  /**
   * When the panel is rendered inside a Modal/Drawer (mobile), set this to
   * drop the standalone "card" chrome (title + sticky + rounded border) so
   * the surrounding Modal owns those concerns. Without this, you end up
   * with two stacked headers and a card-in-a-card.
   */
  embedded?: boolean
}

export function ProductFiltersPanel({ categories, onClose, embedded = false }: Props) {
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
    trackAnalyticsEvent('filter_used', {
      filter_type: key,
      filter_value: value,
      action: value === null ? 'clear' : 'set',
    })
    router.push(`${pathname}?${p.toString()}`)
    onClose?.()
  }, [router, pathname, searchParams, onClose])

  const toggleCert = (cert: string) => {
    const current = searchParams.getAll('cert')
    const wasActive = current.includes(cert)
    const p = new URLSearchParams(searchParams.toString())
    p.delete('cert')
    if (wasActive) {
      current.filter(c => c !== cert).forEach(c => p.append('cert', c))
    } else {
      [...current, cert].forEach(c => p.append('cert', c))
    }
    p.delete('pagina')
    trackAnalyticsEvent('filter_used', {
      filter_type: 'cert',
      filter_value: cert,
      action: wasActive ? 'remove' : 'add',
    })
    router.push(`${pathname}?${p.toString()}`)
    onClose?.()
  }

  const currentCat   = searchParams.get('categoria')
  const currentCerts = searchParams.getAll('cert')
  const hasFilters   = currentCat || currentCerts.length > 0

  return (
    <div
      className={cn(
        'space-y-6',
        embedded
          ? ''
          : 'sticky top-24 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm',
      )}
    >
      {/* Standalone header — hidden when embedded (Modal already shows the
          title). The "Clear all" action is preserved either way. */}
      {(!embedded || hasFilters) && (
        <div className="flex items-center justify-between">
          {!embedded && (
            <h3 className="font-semibold text-[var(--foreground)]">{copy.filters.title}</h3>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                router.push(pathname)
                onClose?.()
              }}
              aria-label={copy.filters.clearAllAria}
              className={cn(
                'rounded-md text-xs text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
                embedded && 'ml-auto',
              )}
            >
              {copy.filters.clearAll}
            </button>
          )}
        </div>
      )}

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
          {categories.map(cat => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setParam('categoria', currentCat === cat.slug ? null : cat.slug)}
              aria-pressed={currentCat === cat.slug}
              className={cn(
                'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 focus-visible:ring-inset',
                currentCat === cat.slug
                  ? 'border border-emerald-200 bg-emerald-50 font-medium text-emerald-800 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
              )}
            >
              <span className="flex items-center gap-2">
                {cat.icon && <span>{cat.icon}</span>}
                {translateCategoryLabel(cat.slug, cat.name, locale)}
              </span>
              <span className="text-xs text-[var(--muted)]">{cat._count.products}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Certifications */}
      <div>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">{copy.filters.certifications}</h4>
        <div className="space-y-1.5">
          {CERTIFICATIONS.map(cert => {
            const certCopy = getLocalizedCertificationCopy(cert, locale)
            const active = currentCerts.includes(cert)
            const swatch = CERT_SWATCH[CERT_COLORS[cert] ?? 'default']
            return (
              <div key={cert} className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => toggleCert(cert)}
                  aria-pressed={active}
                  className={cn(
                    'group flex flex-1 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30',
                    active
                      ? 'border-emerald-300 bg-emerald-50 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/40'
                      : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--surface-raised)]'
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-7 min-w-[2.25rem] shrink-0 items-center justify-center rounded-md px-1.5 text-[10px] font-bold tracking-wide',
                      swatch
                    )}
                  >
                    {cert}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm',
                        active ? 'font-medium text-emerald-800 dark:text-emerald-200' : 'text-[var(--foreground-soft)]'
                      )}
                    >
                      {certCopy.label}
                    </span>
                  </span>
                  {active && (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
                <Tooltip content={certCopy.description || certCopy.label} side="right">
                  <span
                    tabIndex={0}
                    role="button"
                    aria-label={`${certCopy.label}: ${certCopy.description || ''}`}
                    className="flex h-full w-7 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0 1 1 0 002 0zm-1 3a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 0110 10z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </Tooltip>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

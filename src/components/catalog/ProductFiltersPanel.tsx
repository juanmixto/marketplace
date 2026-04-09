'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import type { CategoryWithCount } from '@/domains/catalog/types'
import { CERTIFICATIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'

interface Props {
  categories: CategoryWithCount[]
}

export function ProductFiltersPanel({ categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback((key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null) p.delete(key)
    else p.set(key, value)
    p.delete('pagina')
    router.push(`${pathname}?${p.toString()}`)
  }, [router, pathname, searchParams])

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
  }

  const currentCat   = searchParams.get('categoria')
  const currentCerts = searchParams.getAll('cert')
  const hasFilters   = currentCat || currentCerts.length > 0

  return (
    <div className="space-y-6 sticky top-24">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-[var(--foreground)]">Filtros</h3>
        {hasFilters && (
          <button
            onClick={() => router.push(pathname)}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline underline-offset-2"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {/* Categories */}
      <div>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Categoría</h4>
        <div className="space-y-0.5">
          <button
            onClick={() => setParam('categoria', null)}
            className={cn(
              'w-full text-left rounded-xl px-3 py-2 text-sm transition-colors',
              !currentCat
                ? 'bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
            )}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setParam('categoria', currentCat === cat.slug ? null : cat.slug)}
              className={cn(
                'w-full text-left rounded-xl px-3 py-2 text-sm transition-colors flex items-center justify-between',
                currentCat === cat.slug
                  ? 'bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]'
              )}
            >
              <span className="flex items-center gap-2">
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </span>
              <span className="text-xs text-[var(--muted)]">{cat._count.products}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Certifications */}
      <div>
        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Certificaciones</h4>
        <div className="space-y-2">
          {CERTIFICATIONS.map(cert => (
            <label key={cert} className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={currentCerts.includes(cert)}
                onChange={() => toggleCert(cert)}
                className="rounded border-[var(--border)] text-emerald-600 focus:ring-emerald-500 dark:border-[var(--border-strong)]"
              />
              <span className="text-sm text-[var(--foreground-soft)]">{cert}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

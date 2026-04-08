'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import type { CategoryWithCount } from '@/domains/catalog/types'
import { CERTIFICATIONS } from '@/lib/constants'

interface Props {
  categories: CategoryWithCount[]
}

export function ProductFiltersPanel({ categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = useCallback((key: string, value: string | null) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value === null) {
      p.delete(key)
    } else {
      p.set(key, value)
    }
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

  const currentCat = searchParams.get('categoria')
  const currentCerts = searchParams.getAll('cert')
  const hasFilters = currentCat || currentCerts.length > 0

  return (
    <div className="space-y-6 sticky top-24">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Filtros</h3>
        {hasFilters && (
          <button
            onClick={() => router.push(pathname)}
            className="text-xs text-emerald-600 hover:underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Categories */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-700">Categoría</h4>
        <div className="space-y-1">
          <button
            onClick={() => setParam('categoria', null)}
            className={`w-full text-left rounded-lg px-3 py-1.5 text-sm transition ${!currentCat ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Todas
          </button>
          {categories.map(cat => (
            <button
              key={cat.slug}
              onClick={() => setParam('categoria', currentCat === cat.slug ? null : cat.slug)}
              className={`w-full text-left rounded-lg px-3 py-1.5 text-sm transition flex items-center justify-between ${currentCat === cat.slug ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <span className="flex items-center gap-2">
                {cat.icon && <span>{cat.icon}</span>}
                {cat.name}
              </span>
              <span className="text-xs text-gray-400">{cat._count.products}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Certifications */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-700">Certificaciones</h4>
        <div className="space-y-2">
          {CERTIFICATIONS.map(cert => (
            <label key={cert} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={currentCerts.includes(cert)}
                onChange={() => toggleCert(cert)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-gray-600">{cert}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

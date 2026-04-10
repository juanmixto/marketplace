'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

interface Props {
  current?: string
}

const OPTIONS = [
  { value: 'newest',     label: 'Más recientes' },
  { value: 'price_asc',  label: 'Precio: menor a mayor' },
  { value: 'price_desc', label: 'Precio: mayor a menor' },
  { value: 'popular',    label: 'Más populares' },
]

export function SortSelect({ current }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateSort = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('orden', value)
    params.delete('pagina')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <label className="relative block">
      <span className="sr-only">Ordenar productos</span>
      <select
        aria-label="Ordenar productos"
        name="orden"
        defaultValue={current ?? 'newest'}
        onChange={e => updateSort(e.target.value)}
        className={[
          'cursor-pointer appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 pr-10 text-sm text-[var(--foreground)] shadow-sm',
          'transition-colors hover:bg-[var(--surface-raised)]',
          'focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20',
          'dark:focus:border-emerald-400 dark:focus:ring-emerald-400/20',
        ].join(' ')}
      >
        {OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.97l3.71-3.74a.75.75 0 1 1 1.06 1.06l-4.24 4.28a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z" clipRule="evenodd" />
      </svg>
    </label>
  )
}

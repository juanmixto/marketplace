'use client'

import { useMemo, useState, useTransition } from 'react'
import type { OrderRow, SerializableFilters } from '@/domains/analytics/types'
import { formatPrice } from '@/lib/utils'
import { exportOrdersCsv } from '@/domains/analytics/actions'

interface Props {
  rows: OrderRow[]
  filters: SerializableFilters
}

type SortKey = 'placedAt' | 'grandTotal' | 'customerName' | 'vendorName' | 'status'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 20

const STATUS_LABELS: Record<string, string> = {
  PLACED: 'Realizado',
  PAYMENT_CONFIRMED: 'Pagado',
  PROCESSING: 'Procesando',
  PARTIALLY_SHIPPED: 'Parcial',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Reembolsado',
}

function rawFiltersFromSerializable(f: SerializableFilters): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {
    preset: f.preset,
    from: f.from,
    to: f.to,
  }
  if (f.vendorId) out.vendorId = f.vendorId
  if (f.categoryId) out.categoryId = f.categoryId
  if (f.orderStatus) out.status = f.orderStatus
  return out
}

export function OrdersTable({ rows, filters }: Props) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('placedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [isExporting, startExport] = useTransition()
  const [exportError, setExportError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? rows.filter(
          r =>
            r.orderNumber.toLowerCase().includes(q) ||
            r.customerName.toLowerCase().includes(q) ||
            r.vendorName.toLowerCase().includes(q),
        )
      : rows
    const sorted = [...base].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === bv) return 0
      const cmp = av > bv ? 1 : -1
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [rows, query, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageRows = filtered.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const exportCsv = () => {
    setExportError(null)
    startExport(async () => {
      try {
        const csv = await exportOrdersCsv(rawFiltersFromSerializable(filters))
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'export_failed'
        if (message === 'rate_limit_exceeded') {
          setExportError('Has superado el límite de exportaciones. Intenta de nuevo en una hora.')
        } else {
          setExportError('No se pudo exportar el CSV. Inténtalo de nuevo.')
        }
      }
    })
  }

  const sortIcon = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Pedidos en el periodo</h3>
        <span className="text-xs text-[var(--muted)]">{filtered.length} resultados</span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Buscar nº, cliente, productor…"
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--foreground)]"
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={isExporting}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            {isExporting ? 'Exportando…' : 'Exportar CSV'}
          </button>
        </div>
      </div>
      {exportError && (
        <div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {exportError}
        </div>
      )}

      <div className="overflow-x-auto overscroll-x-contain touch-pan-x">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--muted-light)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 py-2 font-medium">Nº</th>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('placedAt')}>
                Fecha{sortIcon('placedAt')}
              </th>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('customerName')}>
                Cliente{sortIcon('customerName')}
              </th>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('vendorName')}>
                Productor{sortIcon('vendorName')}
              </th>
              <th className="cursor-pointer px-4 py-2 font-medium" onClick={() => toggleSort('status')}>
                Estado{sortIcon('status')}
              </th>
              <th className="cursor-pointer px-4 py-2 text-right font-medium" onClick={() => toggleSort('grandTotal')}>
                Total{sortIcon('grandTotal')}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r => (
              <tr key={r.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-raised)]">
                <td className="px-4 py-2 font-mono text-xs">{r.orderNumber}</td>
                <td className="px-4 py-2 text-xs text-[var(--muted)]">
                  {new Date(r.placedAt).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </td>
                <td className="px-4 py-2">{r.customerName || '—'}</td>
                <td className="px-4 py-2 text-[var(--muted)]">{r.vendorName}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--foreground)]">
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-semibold">{formatPrice(r.grandTotal)}</td>
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                  No hay pedidos para estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">
          <span>
            Página {clampedPage + 1} de {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={clampedPage === 0}
              className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              ← Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
              disabled={clampedPage >= pageCount - 1}
              className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

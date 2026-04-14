'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { Badge } from '@/components/ui/badge'
import type { BadgeVariant } from '@/domains/catalog/types'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'

export type PickerProductStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'

export interface PickerProduct {
  id: string
  name: string
  status: PickerProductStatus
}

export function productStatusLabelKey(status: PickerProductStatus): TranslationKeys {
  switch (status) {
    case 'ACTIVE':         return 'vendor.productsList.statusActive'
    case 'PENDING_REVIEW': return 'vendor.productsList.statusPendingReview'
    case 'DRAFT':          return 'vendor.productsList.statusDraft'
    case 'REJECTED':       return 'vendor.productsList.statusRejected'
    case 'SUSPENDED':      return 'vendor.productsList.statusSuspended'
  }
}

export function productStatusBadgeVariant(status: PickerProductStatus): BadgeVariant {
  switch (status) {
    case 'ACTIVE':         return 'green'
    case 'PENDING_REVIEW': return 'amber'
    case 'REJECTED':       return 'red'
    default:               return 'default'
  }
}

export const PRODUCT_STATUS_ORDER: Record<PickerProductStatus, number> = {
  ACTIVE: 0,
  PENDING_REVIEW: 1,
  DRAFT: 2,
  REJECTED: 3,
  SUSPENDED: 4,
}

interface ProductPickerProps<P extends PickerProduct> {
  products: P[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  /** Allow clearing the selection via a first "none" row. */
  allowClear?: boolean
}

export function ProductPicker<P extends PickerProduct>({
  products,
  value,
  onChange,
  placeholder,
  allowClear = true,
}: ProductPickerProps<P>) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleDocClick)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleDocClick)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  const selected = products.find(p => p.id === value) ?? null

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{selected.name}</span>
            <Badge variant={productStatusBadgeVariant(selected.status)}>
              {t(productStatusLabelKey(selected.status))}
            </Badge>
          </span>
        ) : (
          <span className="text-[var(--muted)]">{placeholder}</span>
        )}
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-[var(--muted)]" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg"
        >
          {allowClear && (
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
              className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition hover:bg-[var(--surface-raised)] ${
                value === '' ? 'bg-[var(--surface-raised)]' : ''
              }`}
            >
              <span className="text-[var(--muted)]">{placeholder}</span>
            </button>
          )}
          {products.map(p => {
            const selectedRow = p.id === value
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={selectedRow}
                onClick={() => {
                  onChange(p.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition hover:bg-[var(--surface-raised)] ${
                  selectedRow ? 'bg-[var(--surface-raised)]' : ''
                }`}
              >
                <span className="min-w-0 truncate text-[var(--foreground)]">{p.name}</span>
                <Badge variant={productStatusBadgeVariant(p.status)}>
                  {t(productStatusLabelKey(p.status))}
                </Badge>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

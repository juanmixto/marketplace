'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminUpdateProduct, type AdminProductInput } from '@/domains/admin/writes'

const PRODUCT_STATUSES = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const

interface CategoryOption { id: string; name: string }

interface InitialProduct {
  id: string
  name: string
  description: string | null
  categoryId: string | null
  basePrice: number
  compareAtPrice: number | null
  taxRate: number
  unit: string
  stock: number
  trackStock: boolean
  status: string
  originRegion: string | null
  rejectionNote: string | null
  expiresAt: string | null
}

interface Props {
  product: InitialProduct
  categories: CategoryOption[]
}

export function AdminProductEditForm({ product, categories }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [trackStock, setTrackStock] = useState(product.trackStock)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const fd = new FormData(event.currentTarget)
    const tracking = fd.get('trackStock') === 'on'
    const input: AdminProductInput = {
      name: String(fd.get('name') ?? ''),
      description: fd.get('description')?.toString() || null,
      categoryId: fd.get('categoryId')?.toString() || null,
      basePrice: Number(fd.get('basePrice')),
      compareAtPrice: fd.get('compareAtPrice') ? Number(fd.get('compareAtPrice')) : null,
      taxRate: Number(fd.get('taxRate')),
      unit: String(fd.get('unit') ?? 'kg'),
      stock: tracking ? Number(fd.get('stock')) : 0,
      trackStock: tracking,
      status: fd.get('status') as AdminProductInput['status'],
      originRegion: fd.get('originRegion')?.toString() || null,
      rejectionNote: fd.get('rejectionNote')?.toString() || null,
      expiresAt: fd.get('expiresAt')?.toString() || null,
    }

    startTransition(async () => {
      try {
        await adminUpdateProduct(product.id, input)
        setSuccess(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Nombre">
        <input name="name" defaultValue={product.name} required minLength={3} maxLength={100} className={inputCls} />
      </Field>

      <Field label="Descripción">
        <textarea name="description" defaultValue={product.description ?? ''} rows={4} maxLength={2000} spellCheck autoCapitalize="sentences" className={inputCls} />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Categoría">
          <select name="categoryId" defaultValue={product.categoryId ?? ''} className={inputCls}>
            <option value="">Sin categoría</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Estado">
          <select name="status" defaultValue={product.status} className={inputCls}>
            {PRODUCT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Precio base (€)">
          <input name="basePrice" type="number" step="0.01" min="0" defaultValue={product.basePrice} required className={inputCls} />
        </Field>
        <Field label="Precio tachado (€)">
          <input name="compareAtPrice" type="number" step="0.01" min="0" defaultValue={product.compareAtPrice ?? ''} className={inputCls} />
        </Field>
        <Field label="IVA">
          <select name="taxRate" defaultValue={product.taxRate} className={inputCls}>
            <option value="0.04">4%</option>
            <option value="0.10">10%</option>
            <option value="0.21">21%</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Unidad">
          <input name="unit" defaultValue={product.unit} required maxLength={20} className={inputCls} />
        </Field>
        <Field label="Stock">
          <input
            name="stock"
            type="number"
            min="0"
            defaultValue={product.stock}
            required={trackStock}
            disabled={!trackStock}
            placeholder={trackStock ? undefined : 'Sin control de stock'}
            className={`${inputCls} disabled:cursor-not-allowed disabled:opacity-50`}
          />
        </Field>
        <Field label="Trackear stock">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              name="trackStock"
              type="checkbox"
              checked={trackStock}
              onChange={e => setTrackStock(e.target.checked)}
            />
            <span>{trackStock ? 'Sí' : 'No'}</span>
          </label>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Región de origen">
          <input name="originRegion" defaultValue={product.originRegion ?? ''} maxLength={100} className={inputCls} />
        </Field>
        <Field label="Caducidad">
          <input name="expiresAt" type="date" defaultValue={product.expiresAt ?? ''} className={inputCls} />
        </Field>
      </div>

      <Field label="Nota de rechazo (sólo si aplica)">
        <textarea name="rejectionNote" defaultValue={product.rejectionNote ?? ''} rows={2} maxLength={500} spellCheck autoCapitalize="sentences" className={inputCls} />
      </Field>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">{error}</p>
      )}
      {success && (
        <p className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Cambios guardados.</p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="rounded bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  )
}

const inputCls =
  'h-10 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] focus:border-emerald-500 focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span>
      {children}
    </label>
  )
}

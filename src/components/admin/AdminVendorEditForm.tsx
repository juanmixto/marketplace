'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminUpdateVendor, type AdminVendorInput } from '@/domains/admin/writes'

const VENDOR_STATUSES = [
  'APPLYING',
  'PENDING_DOCS',
  'ACTIVE',
  'SUSPENDED_TEMP',
  'SUSPENDED_PERM',
  'REJECTED',
] as const

// Mirror of the `VendorCategory` enum + Spanish label. Single source of
// truth for the badge text lives in the i18n `vendorVisual.*` keys, but
// admin edit is superadmin-only and Spanish is the admin UI language, so
// we hardcode the Spanish label here to avoid pulling the i18n runtime
// into a tiny <select>.
const VENDOR_CATEGORIES: ReadonlyArray<{ value: NonNullable<AdminVendorInput['category']>; label: string }> = [
  { value: 'BAKERY', label: 'Panadería artesanal' },
  { value: 'CHEESE', label: 'Quesería artesanal' },
  { value: 'WINERY', label: 'Bodega local' },
  { value: 'ORCHARD', label: 'Huerta de temporada' },
  { value: 'OLIVE_OIL', label: 'Aceite y olivar' },
  { value: 'FARM', label: 'Granja familiar' },
  { value: 'DRYLAND', label: 'Campo de secano' },
  { value: 'LOCAL_PRODUCER', label: 'Productor local' },
]

interface InitialVendor {
  id: string
  displayName: string
  slug: string
  description: string | null
  location: string | null
  category: string | null
  status: string
  commissionRate: number
}

export function AdminVendorEditForm({ vendor }: { vendor: InitialVendor }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const fd = new FormData(event.currentTarget)
    const categoryRaw = fd.get('category')?.toString() || ''
    const input: AdminVendorInput = {
      displayName: String(fd.get('displayName') ?? ''),
      slug: String(fd.get('slug') ?? ''),
      description: fd.get('description')?.toString() || null,
      location: fd.get('location')?.toString() || null,
      category: categoryRaw ? (categoryRaw as AdminVendorInput['category']) : null,
      status: fd.get('status') as AdminVendorInput['status'],
      commissionRate: Number(fd.get('commissionRatePercent')) / 100,
    }

    startTransition(async () => {
      try {
        await adminUpdateVendor(vendor.id, input)
        setSuccess(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre público">
          <input name="displayName" defaultValue={vendor.displayName} required minLength={2} maxLength={100} className={inputCls} />
        </Field>
        <Field label="Slug (URL)">
          <input name="slug" defaultValue={vendor.slug} required pattern="[a-z0-9-]+" minLength={2} maxLength={100} className={inputCls} />
        </Field>
      </div>

      <Field label="Descripción">
        <textarea name="description" defaultValue={vendor.description ?? ''} rows={4} maxLength={2000} spellCheck autoCapitalize="sentences" className={inputCls} />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Tipo de productor (badge público)">
          <select name="category" defaultValue={vendor.category ?? ''} className={inputCls}>
            <option value="">Automático (según nombre/descripción)</option>
            {VENDOR_CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-[var(--muted)]">Aparece como etiqueta sobre la foto en /productores.</span>
        </Field>
        <Field label="Ubicación">
          <input name="location" defaultValue={vendor.location ?? ''} maxLength={100} className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Estado">
          <select name="status" defaultValue={vendor.status} className={inputCls}>
            {VENDOR_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Comisión (%)">
          <input
            name="commissionRatePercent"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={(vendor.commissionRate * 100).toFixed(2)}
            required
            className={inputCls}
          />
        </Field>
      </div>

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

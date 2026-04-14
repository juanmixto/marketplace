'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminUpdatePromotion, type AdminPromotionInput } from '@/domains/admin/writes'

const PROMOTION_KINDS = ['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING'] as const
const PROMOTION_SCOPES = ['PRODUCT', 'VENDOR', 'CATEGORY'] as const

interface Option { id: string; label: string }

interface InitialPromotion {
  id: string
  name: string
  code: string | null
  kind: string
  value: number
  scope: string
  productId: string | null
  categoryId: string | null
  minSubtotal: number | null
  maxRedemptions: number | null
  perUserLimit: number | null
  startsAt: string
  endsAt: string
}

interface Props {
  promotion: InitialPromotion
  vendorProducts: Option[]
  categories: Option[]
}

export function AdminPromotionEditForm({ promotion, vendorProducts, categories }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [scope, setScope] = useState(promotion.scope)
  const [kind, setKind] = useState(promotion.kind)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const fd = new FormData(event.currentTarget)
    const input: AdminPromotionInput = {
      name: String(fd.get('name') ?? ''),
      code: fd.get('code')?.toString() || null,
      kind: fd.get('kind') as AdminPromotionInput['kind'],
      value: Number(fd.get('value') ?? 0),
      scope: fd.get('scope') as AdminPromotionInput['scope'],
      productId: fd.get('productId')?.toString() || null,
      categoryId: fd.get('categoryId')?.toString() || null,
      minSubtotal: fd.get('minSubtotal') ? Number(fd.get('minSubtotal')) : null,
      maxRedemptions: fd.get('maxRedemptions') ? Number(fd.get('maxRedemptions')) : null,
      perUserLimit: fd.get('perUserLimit') ? Number(fd.get('perUserLimit')) : null,
      startsAt: String(fd.get('startsAt') ?? ''),
      endsAt: String(fd.get('endsAt') ?? ''),
    }

    startTransition(async () => {
      try {
        await adminUpdatePromotion(promotion.id, input)
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
        <Field label="Nombre">
          <input name="name" defaultValue={promotion.name} required minLength={3} maxLength={100} className={inputCls} />
        </Field>
        <Field label="Código (opcional)">
          <input name="code" defaultValue={promotion.code ?? ''} maxLength={40} className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Tipo">
          <select name="kind" value={kind} onChange={e => setKind(e.target.value)} className={inputCls}>
            {PROMOTION_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label={kind === 'PERCENTAGE' ? 'Porcentaje (%)' : kind === 'FIXED_AMOUNT' ? 'Descuento (€)' : 'Valor (ignorado)'}>
          <input
            name="value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={promotion.value}
            disabled={kind === 'FREE_SHIPPING'}
            className={inputCls}
          />
        </Field>
        <Field label="Ámbito">
          <select name="scope" value={scope} onChange={e => setScope(e.target.value)} className={inputCls}>
            {PROMOTION_SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      {scope === 'PRODUCT' && (
        <Field label="Producto">
          <select name="productId" defaultValue={promotion.productId ?? ''} className={inputCls} required>
            <option value="">Selecciona un producto</option>
            {vendorProducts.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </Field>
      )}

      {scope === 'CATEGORY' && (
        <Field label="Categoría">
          <select name="categoryId" defaultValue={promotion.categoryId ?? ''} className={inputCls} required>
            <option value="">Selecciona una categoría</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Mínimo subtotal (€)">
          <input name="minSubtotal" type="number" step="0.01" min="0" defaultValue={promotion.minSubtotal ?? ''} className={inputCls} />
        </Field>
        <Field label="Máx. canjes totales">
          <input name="maxRedemptions" type="number" min="1" defaultValue={promotion.maxRedemptions ?? ''} className={inputCls} />
        </Field>
        <Field label="Límite por usuario">
          <input name="perUserLimit" type="number" min="1" defaultValue={promotion.perUserLimit ?? 1} className={inputCls} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Empieza">
          <input name="startsAt" type="datetime-local" defaultValue={toLocalDatetime(promotion.startsAt)} required className={inputCls} />
        </Field>
        <Field label="Termina">
          <input name="endsAt" type="datetime-local" defaultValue={toLocalDatetime(promotion.endsAt)} required className={inputCls} />
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

function toLocalDatetime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  approveProductDraft,
  editProductDraft,
  discardProductDraft,
  discardUnextractable,
  markUnextractableValid,
} from '@/domains/ingestion'

interface ProductDraftActionsProps {
  kind: 'PRODUCT_DRAFT'
  draftId: string
  canEdit: boolean
  initialValues: {
    productName: string | null
    priceCents: number | null
    currencyCode: string | null
    unit: string | null
    weightGrams: number | null
    categorySlug: string | null
    availability: string | null
  }
}

interface UnextractableActionsProps {
  kind: 'UNEXTRACTABLE_PRODUCT'
  extractionId: string
  canAct: boolean
}

type Props = ProductDraftActionsProps | UnextractableActionsProps

const UNIT_OPTIONS = ['', 'KG', 'G', 'L', 'ML', 'UNIT'] as const
const AVAILABILITY_OPTIONS = ['', 'AVAILABLE', 'UNAVAILABLE', 'UNKNOWN'] as const

export function ReviewItemActions(props: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const runAction = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error')
      }
    })
  }

  if (props.kind === 'UNEXTRACTABLE_PRODUCT') {
    const { extractionId, canAct } = props
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!canAct || isPending}
            onClick={() => runAction(() => markUnextractableValid({ extractionId }))}
          >
            Marcar como válido
          </Button>
          <Button
            variant="danger"
            disabled={!canAct || isPending}
            onClick={() => runAction(() => discardUnextractable({ extractionId }))}
          >
            Descartar
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    )
  }

  const { draftId, canEdit, initialValues } = props

  if (editing) {
    return (
      <form
        className="space-y-3 rounded border border-[var(--border)] bg-[var(--surface)] p-4"
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const rawPrice = fd.get('priceCents')
          const rawWeight = fd.get('weightGrams')
          const rawProductName = (fd.get('productName') as string | null) ?? null
          const rawCategorySlug = (fd.get('categorySlug') as string | null) ?? null
          const rawCurrency = (fd.get('currencyCode') as string | null) ?? null
          const rawUnit = (fd.get('unit') as string | null) ?? null
          const rawAvailability = (fd.get('availability') as string | null) ?? null
          const patch: Record<string, unknown> = {
            productName: rawProductName === '' ? null : rawProductName,
            categorySlug: rawCategorySlug === '' ? null : rawCategorySlug,
            currencyCode: rawCurrency === '' ? null : rawCurrency,
            unit: rawUnit === '' ? null : rawUnit,
            availability: rawAvailability === '' ? null : rawAvailability,
            priceCents:
              rawPrice === null || rawPrice === '' ? null : Number(rawPrice),
            weightGrams:
              rawWeight === null || rawWeight === '' ? null : Number(rawWeight),
          }
          runAction(async () => {
            await editProductDraft({ draftId, patch })
            setEditing(false)
          })
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">Producto</span>
            <input
              name="productName"
              defaultValue={initialValues.productName ?? ''}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
              maxLength={120}
            />
          </label>
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">Categoría (slug)</span>
            <input
              name="categorySlug"
              defaultValue={initialValues.categorySlug ?? ''}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
              maxLength={80}
            />
          </label>
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">Precio (céntimos)</span>
            <input
              name="priceCents"
              type="number"
              min={0}
              defaultValue={initialValues.priceCents ?? ''}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">Moneda</span>
            <input
              name="currencyCode"
              defaultValue={initialValues.currencyCode ?? 'EUR'}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
              maxLength={3}
            />
          </label>
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">Unidad</span>
            <select
              name="unit"
              defaultValue={initialValues.unit ?? ''}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u || '—'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="block font-medium text-[var(--muted-foreground)]">Peso (g)</span>
            <input
              name="weightGrams"
              type="number"
              min={0}
              defaultValue={initialValues.weightGrams ?? ''}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="block font-medium text-[var(--muted-foreground)]">Disponibilidad</span>
            <select
              name="availability"
              defaultValue={initialValues.availability ?? ''}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 text-sm"
            >
              {AVAILABILITY_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a || '—'}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            Guardar cambios
          </Button>
          <Button type="button" variant="secondary" disabled={isPending} onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!canEdit || isPending}
          onClick={() => runAction(() => approveProductDraft({ draftId }))}
        >
          Aprobar
        </Button>
        <Button
          variant="secondary"
          disabled={!canEdit || isPending}
          onClick={() => setEditing(true)}
        >
          Editar
        </Button>
        <Button
          variant="danger"
          disabled={!canEdit || isPending}
          onClick={() => runAction(() => discardProductDraft({ draftId }))}
        >
          Descartar
        </Button>
      </div>
      {!canEdit && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Este draft ya está resuelto — acciones deshabilitadas.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

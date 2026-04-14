'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminUpdateSubscriptionPlan, type AdminSubscriptionPlanInput } from '@/domains/admin/writes'

const CADENCES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const
const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface InitialPlan {
  id: string
  cadence: string
  priceSnapshot: number
  taxRateSnapshot: number
  cutoffDayOfWeek: number
  archived: boolean
}

export function AdminSubscriptionPlanEditForm({ plan }: { plan: InitialPlan }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    const fd = new FormData(event.currentTarget)
    const input: AdminSubscriptionPlanInput = {
      cadence: fd.get('cadence') as AdminSubscriptionPlanInput['cadence'],
      priceSnapshot: Number(fd.get('priceSnapshot')),
      taxRateSnapshot: Number(fd.get('taxRateSnapshot')),
      cutoffDayOfWeek: Number(fd.get('cutoffDayOfWeek')),
      archived: fd.get('archived') === 'on',
    }

    startTransition(async () => {
      try {
        await adminUpdateSubscriptionPlan(plan.id, input)
        setSuccess(true)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido')
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Los cambios de precio sólo aplican a <strong>nuevas suscripciones</strong>. Las suscripciones
        ya activas mantienen el precio original de Stripe hasta que se cancelen y re-suscriban.
      </p>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Cadencia">
          <select name="cadence" defaultValue={plan.cadence} className={inputCls}>
            {CADENCES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Precio (€)">
          <input name="priceSnapshot" type="number" step="0.01" min="0" defaultValue={plan.priceSnapshot} required className={inputCls} />
        </Field>
        <Field label="IVA">
          <select name="taxRateSnapshot" defaultValue={plan.taxRateSnapshot} className={inputCls}>
            <option value="0.04">4%</option>
            <option value="0.10">10%</option>
            <option value="0.21">21%</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Día de corte semanal">
          <select name="cutoffDayOfWeek" defaultValue={plan.cutoffDayOfWeek} className={inputCls}>
            {DAYS.map((d, i) => <option key={i} value={i}>{i} — {d}</option>)}
          </select>
        </Field>
        <Field label="Archivado">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input name="archived" type="checkbox" defaultChecked={plan.archived} />
            <span>Archivar plan (no visible para nuevos suscriptores)</span>
          </label>
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

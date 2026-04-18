'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { createSubscriptionPlan, updateSubscriptionPlan } from '@/domains/subscriptions/actions'
import { useT } from '@/i18n'
import type { TranslationKeys } from '@/i18n/locales'
import { formatPrice } from '@/lib/utils'
import { ProductPicker, type PickerProductStatus } from '@/components/vendor/ProductPicker'

type Cadence = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'
const ALL_CADENCES: Cadence[] = ['WEEKLY', 'BIWEEKLY', 'MONTHLY']

const formSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  cadence: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  cutoffDayOfWeek: z.coerce.number().int().min(0).max(6),
})

type FormInput = z.input<typeof formSchema>
type FormValues = z.output<typeof formSchema>

interface Props {
  products: {
    id: string
    name: string
    basePrice: number
    unit: string
    status: PickerProductStatus
  }[]
  /**
   * Multi-cadence UX: for each product id, the list of cadences that
   * already have an ACTIVE plan. The form uses this to dim taken rows
   * in the product picker and to disable taken cadence buttons. Omitted
   * in edit mode — the backend only lets you change `cutoffDayOfWeek`
   * and the product+cadence are locked by the UI anyway.
   */
  takenCadencesByProduct?: Record<string, Cadence[] | undefined>
  /**
   * Present only in edit mode. Product and cadence are locked (the
   * product is tied to the plan via @@unique, and the cadence is tied
   * to the immutable Stripe Price). Only the cutoff day can change.
   */
  initial?: {
    id: string
    productId: string
    productName: string
    productUnit: string
    priceSnapshot: number
    cadence: Cadence
    cutoffDayOfWeek: number
  }
}

const CADENCE_OPTIONS: {
  value: Cadence
  labelKey: TranslationKeys
}[] = [
  { value: 'WEEKLY',   labelKey: 'vendor.subscriptionPlans.cadenceWeekly'   },
  { value: 'BIWEEKLY', labelKey: 'vendor.subscriptionPlans.cadenceBiweekly' },
  { value: 'MONTHLY',  labelKey: 'vendor.subscriptionPlans.cadenceMonthly'  },
]

function cadenceShortLabelKey(cadence: Cadence): TranslationKeys {
  if (cadence === 'WEEKLY') return 'vendor.subscriptionPlans.cadenceWeekly'
  if (cadence === 'BIWEEKLY') return 'vendor.subscriptionPlans.cadenceBiweekly'
  return 'vendor.subscriptionPlans.cadenceMonthly'
}

function cadenceTakenLabelKey(cadence: Cadence): TranslationKeys {
  if (cadence === 'WEEKLY') return 'vendor.subscriptionPlans.takenWeekly'
  if (cadence === 'BIWEEKLY') return 'vendor.subscriptionPlans.takenBiweekly'
  return 'vendor.subscriptionPlans.takenMonthly'
}

// Monday-first display order. The schema still stores the ISO day-of-week
// value where Sunday=0 … Saturday=6, so the button value maps back to that.
const DAYS_MON_FIRST: { value: number; shortKey: TranslationKeys }[] = [
  { value: 1, shortKey: 'vendor.subscriptionPlans.dayShortMon' },
  { value: 2, shortKey: 'vendor.subscriptionPlans.dayShortTue' },
  { value: 3, shortKey: 'vendor.subscriptionPlans.dayShortWed' },
  { value: 4, shortKey: 'vendor.subscriptionPlans.dayShortThu' },
  { value: 5, shortKey: 'vendor.subscriptionPlans.dayShortFri' },
  { value: 6, shortKey: 'vendor.subscriptionPlans.dayShortSat' },
  { value: 0, shortKey: 'vendor.subscriptionPlans.dayShortSun' },
]

export function SubscriptionPlanForm({
  products,
  takenCadencesByProduct = {},
  initial,
}: Props) {
  const t = useT()
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isEdit = Boolean(initial)

  // Helpers — "which cadences does THIS product have?" and the inverse.
  const takenFor = (pid: string | undefined): Cadence[] =>
    pid ? takenCadencesByProduct[pid] ?? [] : []
  const availableFor = (pid: string | undefined): Cadence[] =>
    ALL_CADENCES.filter(c => !takenFor(pid).includes(c))

  // Pick a sensible initial default product: the first one that still has
  // at least one free cadence. If none, fall back to the first product
  // (the vendor will see the dimmed state and submit will also refuse).
  const firstWithFreeCadence =
    products.find(p => availableFor(p.id).length > 0)?.id ?? products[0]?.id ?? ''

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initial
      ? {
          productId: initial.productId,
          cadence: initial.cadence,
          cutoffDayOfWeek: initial.cutoffDayOfWeek,
        }
      : {
          productId: firstWithFreeCadence,
          cadence: availableFor(firstWithFreeCadence)[0] ?? 'WEEKLY',
          cutoffDayOfWeek: 5, // Friday — standard for Monday drops
        },
  })

  const productId = watch('productId')
  const cadence = watch('cadence')
  const cutoffDayOfWeek = watch('cutoffDayOfWeek')
  const selected = products.find(p => p.id === productId)

  // When the vendor picks a product whose current cadence is already
  // taken, auto-switch to the first free cadence so the form stays in
  // a submittable state by default. Only runs in create mode — edit
  // mode locks both fields.
  useEffect(() => {
    if (isEdit) return
    if (!productId) return
    const taken = takenFor(productId)
    if (taken.includes(cadence)) {
      const next = availableFor(productId)[0]
      if (next) {
        setValue('cadence', next, { shouldDirty: true, shouldValidate: true })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-evaluate when productId changes; including takenFor / cadence / setValue would re-run on every render and snap the cadence away while the user is still picking
  }, [productId])

  // Pre-compute the disabled-reason map for the product picker. Depends
  // on the currently selected cadence: a product is only "blocked" if
  // it already has the cadence the vendor is trying to add (or all
  // three cadences, in which case we show a dedicated message).
  const disabledReasonById = useMemo<Record<string, string | undefined>>(() => {
    if (isEdit) return {}
    const map: Record<string, string | undefined> = {}
    for (const p of products) {
      const taken = takenFor(p.id)
      if (taken.length >= ALL_CADENCES.length) {
        map[p.id] = t('vendor.subscriptionPlans.allCadencesPublished')
      } else if (taken.includes(cadence)) {
        map[p.id] = t(cadenceTakenLabelKey(cadence))
      }
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- takenFor + cadenceTakenLabelKey are stable helpers (closures over takenCadencesByProduct, which IS in deps). Listing them would force a useMemo on each helper for no observable benefit
  }, [products, cadence, isEdit, takenCadencesByProduct, t])

  function onSubmit(values: FormValues) {
    setServerError(null)
    startTransition(async () => {
      try {
        if (initial) {
          await updateSubscriptionPlan(initial.id, {
            cutoffDayOfWeek: values.cutoffDayOfWeek,
          })
        } else {
          await createSubscriptionPlan(values)
        }
        router.push('/vendor/suscripciones')
        router.refresh()
      } catch (err) {
        setServerError(
          err instanceof Error ? err.message : t('vendor.subscriptionPlans.errorGeneric')
        )
      }
    })
  }

  if (!isEdit && products.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-[var(--border)] p-8 text-center">
        <p className="text-[var(--muted)]">
          {t('vendor.subscriptionPlans.noEligibleProducts')}
        </p>
      </div>
    )
  }

  const cutoffHintKey: TranslationKeys =
    cadence === 'WEEKLY'   ? 'vendor.subscriptionPlans.formCutoffHintWeekly'   :
    cadence === 'BIWEEKLY' ? 'vendor.subscriptionPlans.formCutoffHintBiweekly' :
    'vendor.subscriptionPlans.formCutoffHintMonthly'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
        >
          {serverError}
        </div>
      )}

      <Field label={t('vendor.subscriptionPlans.formProduct')} error={errors.productId?.message}>
        {isEdit && initial ? (
          <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--foreground-soft)]">
            <span className="truncate">{initial.productName}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {t('vendor.subscriptionPlans.lockedField')}
            </span>
          </div>
        ) : (
          <ProductPicker
            products={products}
            value={productId ?? ''}
            onChange={id => setValue('productId', id, { shouldDirty: true, shouldValidate: true })}
            placeholder={t('vendor.subscriptionPlans.formProduct')}
            allowClear={false}
            disabledReasonById={disabledReasonById}
          />
        )}
        {isEdit && initial ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t('vendor.subscriptionPlans.priceSnapshotHint').replace(
              '{price}',
              `${formatPrice(initial.priceSnapshot)} / ${initial.productUnit}`
            )}
          </p>
        ) : (
          selected && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {t('vendor.subscriptionPlans.priceSnapshotHint').replace(
                '{price}',
                `${formatPrice(selected.basePrice)} / ${selected.unit}`
              )}
            </p>
          )
        )}
      </Field>

      <Field label={t('vendor.subscriptionPlans.formCadence')} error={errors.cadence?.message}>
        <div
          role="radiogroup"
          aria-label={t('vendor.subscriptionPlans.formCadence')}
          className="grid grid-cols-3 gap-2"
        >
          {CADENCE_OPTIONS.map(opt => {
            const active = cadence === opt.value
            const takenForSelected = takenFor(productId)
            const taken = !isEdit && takenForSelected.includes(opt.value)
            const disabled = isEdit || taken
            const title = taken
              ? t('vendor.subscriptionPlans.cadenceAlreadyPublished')
              : undefined
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={disabled || undefined}
                disabled={disabled}
                title={title}
                onClick={() => {
                  if (disabled) return
                  setValue('cadence', opt.value, { shouldDirty: true, shouldValidate: true })
                }}
                className={`flex h-10 items-center justify-center gap-1 rounded-lg border px-3 text-sm font-semibold transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                } ${disabled && !active ? 'cursor-not-allowed opacity-50 line-through' : ''}`}
              >
                {t(opt.labelKey)}
              </button>
            )
          })}
        </div>
        {isEdit && (
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t('vendor.subscriptionPlans.cadenceLocked')}
          </p>
        )}
        {!isEdit && takenFor(productId).length > 0 && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {t('vendor.subscriptionPlans.cadenceHintTaken').replace(
              '{cadences}',
              takenFor(productId)
                .map(c => t(cadenceShortLabelKey(c)))
                .join(', '),
            )}
          </p>
        )}
      </Field>

      <Field
        label={t('vendor.subscriptionPlans.formCutoffDay')}
        error={errors.cutoffDayOfWeek?.message}
        hint={t(cutoffHintKey)}
      >
        <div
          role="radiogroup"
          aria-label={t('vendor.subscriptionPlans.formCutoffDay')}
          className="grid grid-cols-7 gap-1.5"
        >
          {DAYS_MON_FIRST.map(day => {
            const active = Number(cutoffDayOfWeek) === day.value
            return (
              <button
                key={day.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  setValue('cutoffDayOfWeek', day.value, { shouldDirty: true, shouldValidate: true })
                }
                className={`h-10 rounded-lg border text-xs font-semibold transition ${
                  active
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-soft)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                {t(day.shortKey)}
              </button>
            )
          })}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push('/vendor/suscripciones')}
        >
          {t('vendor.subscriptionPlans.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting || isPending}>
          {isSubmitting || isPending
            ? t('vendor.subscriptionPlans.saving')
            : isEdit
              ? t('vendor.subscriptionPlans.saveChanges')
              : t('vendor.subscriptionPlans.save')}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="block">
      <span className="block text-sm font-medium text-[var(--foreground-soft)]">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
